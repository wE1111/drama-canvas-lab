import type { CanvasDocument, CanvasEdge, CanvasNode } from "./sampleWorkflow";
import type { WorkflowMode } from "./promptPresets";
import {
  buildAssistantProtocol,
  createWorkflowBranchFromProtocol,
  matchProtocolAction,
  type AssistantProtocol
} from "./assistantProtocol";

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AssistantToolEvent {
  id: string;
  toolName: string;
  status: "running" | "completed";
  summary: string;
}

export interface AssistantInterrupt {
  id: string;
  title: string;
  message: string;
  actionLabel: string;
  payload: Record<string, string>;
}

export type AssistantEvent =
  | { kind: "session"; sessionId: string }
  | { kind: "tool"; tool: AssistantToolEvent }
  | { kind: "messageDelta"; messageId: string; delta: string }
  | { kind: "messageCompleted"; message: AssistantMessage }
  | { kind: "interrupt"; interrupt: AssistantInterrupt }
  | { kind: "interruptResolved"; interruptId: string; decision: "approve" | "reject" }
  | { kind: "done" };

export interface AssistantMutationAPI {
  addNode(node: CanvasNode): void;
  updateNode(nodeId: string, patch: Partial<CanvasNode>): void;
  deleteNode(nodeId: string): void;
  addEdge(edge: CanvasEdge): void;
  createVersion(nodeId: string, note: string, source: "assistant" | "manual" | "generation"): void;
}

export interface AssistantRunOptions {
  sessionId: string;
  message: string;
  mode: WorkflowMode;
  document: CanvasDocument;
  selectedNode: CanvasNode | null;
  emit(event: AssistantEvent): void | Promise<void>;
  mutate: AssistantMutationAPI;
  protocol?: AssistantProtocol;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

async function streamAssistantMessage(
  emit: AssistantRunOptions["emit"],
  content: string,
  id = buildId("assistant")
) {
  const chunks = content
    .split(/(?<=[，。；！])/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (chunks.length === 0) {
    await emit({
      kind: "messageCompleted",
      message: { id, role: "assistant", content }
    });
    return;
  }

  for (const chunk of chunks) {
    await emit({ kind: "messageDelta", messageId: id, delta: chunk });
    await sleep(60);
  }

  await emit({
    kind: "messageCompleted",
    message: { id, role: "assistant", content }
  });
}

async function emitTool(
  emit: AssistantRunOptions["emit"],
  toolName: string,
  summary: string,
  status: "running" | "completed"
) {
  await emit({
    kind: "tool",
    tool: {
      id: buildId("tool"),
      toolName,
      status,
      summary
    }
  });
}

export async function runAssistantTurn(options: AssistantRunOptions) {
  const { sessionId, message, mode, document, selectedNode, emit, mutate } = options;
  const protocol = options.protocol ?? buildAssistantProtocol();
  const normalized = message.trim();

  await emit({ kind: "session", sessionId });

  if (!normalized) {
    await streamAssistantMessage(
      emit,
      "说一个明确动作，我才能在画布上执行。比如：创建第2集工作流、优化当前节点、删除选中节点。"
    );
    await emit({ kind: "done" });
    return;
  }

  const action = matchProtocolAction(normalized, protocol);

  if (!action) {
    await streamAssistantMessage(
      emit,
      "我已经收到你的意图。当前最合适的动作是：创建新工作流、补全当前节点、删除当前节点，或者把优化建议落成节点。你直接说其中一种即可。"
    );
    await emit({ kind: "done" });
    return;
  }

  if (action.requiresSelection && !selectedNode) {
    await streamAssistantMessage(emit, `当前动作「${action.label}」需要先选中一个节点。`);
    await emit({ kind: "done" });
    return;
  }

  if (action.interruptOnExecute && selectedNode) {
    await emit({
      kind: "interrupt",
      interrupt: {
        id: buildId("interrupt"),
        title: "确认删除节点",
        message: `准备删除节点「${selectedNode.title}」。这个动作会同时断开它关联的连线。`,
        actionLabel: "确认删除",
        payload: { nodeId: selectedNode.id }
      }
    });
    return;
  }

  if (action.id === "create-workflow-branch") {
    const branchIdea = normalized.replace(/创建|新建|搭一个|来一套|workflow|工作流/gi, "").trim() || "新的短视频项目";
    const { nodes, edges } = createWorkflowBranchFromProtocol(mode, branchIdea, document);
    await emitTool(emit, "canvas.createItems", `正在根据你的需求创建 ${nodes.length} 个节点和 ${edges.length} 条连线。`, "running");
    nodes.forEach((node) => mutate.addNode(node));
    edges.forEach((edge) => mutate.addEdge(edge));
    nodes.forEach((node) => mutate.createVersion(node.id, "由助手创建工作流骨架", "assistant"));
    await emitTool(emit, "canvas.createItems", `已创建新的「${branchIdea}」工作流骨架。`, "completed");
    await streamAssistantMessage(
      emit,
      `我已经在画布上搭好一套新的工作流骨架。下一步先选中脚本节点或角色节点，我可以继续帮你补全文本、角色锚点或提示词。`
    );
    await emit({ kind: "done" });
    return;
  }

  if (action.id === "optimize-selected-node" && selectedNode) {
    const nextDescription = `${selectedNode.description}\n\n[助手补充] ${action.description}。当前指令：${normalized}`;
    mutate.updateNode(selectedNode.id, {
      description: nextDescription,
      status: selectedNode.status === "draft" ? "review" : selectedNode.status,
      fields: {
        ...selectedNode.fields,
        assistant_note: normalized,
        assistant_action: action.id
      }
    });
    mutate.createVersion(selectedNode.id, `助手优化了 ${selectedNode.title}`, "assistant");
    await emitTool(emit, "canvas.updateItem", `已更新节点「${selectedNode.title}」并写入可回滚历史。`, "completed");
    await streamAssistantMessage(
      emit,
      `我已经基于当前节点补了一轮建议。你现在可以继续编辑它，或者让我继续帮你补下游节点。`
    );
    await emit({ kind: "done" });
    return;
  }

  if (action.id === "write-repair-note") {
    const noteNode: CanvasNode = {
      id: buildId("node"),
      kind: "note",
      title: "助手建议",
      subtitle: "note",
      description: "重镜头只保留关键动作；轻镜头承担信息推进；旁白换更冷更克制的男声；字幕上浮并放大；封面帧必须单独设计。",
      status: "draft",
      x: 240 + (document.nodes.length % 4) * 360,
      y: 180 + Math.floor(document.nodes.length / 4) * 220,
      tags: ["Repair"],
      fields: {
        source: "assistant",
        intent: normalized
      }
    };
    mutate.addNode(noteNode);
    mutate.createVersion(noteNode.id, "助手写入优化建议", "assistant");
    await emitTool(emit, "canvas.createItem", "已把优化建议写成画布节点。", "completed");
    await streamAssistantMessage(
      emit,
      "我把这轮优化建议写成了一个节点。你可以把它连到视频、音频或剪辑节点，作为后续返工依据。"
    );
    await emit({ kind: "done" });
    return;
  }

  await streamAssistantMessage(
    emit,
    `动作「${action.label}」已匹配，但当前这版还没有实现对应执行器。`
  );
  await emit({ kind: "done" });
}

export async function resolveAssistantInterrupt(
  interrupt: AssistantInterrupt,
  decision: "approve" | "reject",
  emit: AssistantRunOptions["emit"],
  mutate: AssistantMutationAPI
) {
  await emit({ kind: "interruptResolved", interruptId: interrupt.id, decision });
  if (decision === "approve" && interrupt.payload.nodeId) {
    mutate.deleteNode(interrupt.payload.nodeId);
    await emitTool(emit, "canvas.deleteItem", "节点已删除。", "completed");
    await streamAssistantMessage(emit, "节点已经从画布中移除，关联连线也一起清理了。");
  } else {
    await streamAssistantMessage(emit, "已取消这次删除操作，画布没有变更。");
  }
  await emit({ kind: "done" });
}
