import type { CanvasDocument, CanvasEdge, CanvasNode, CanvasNodeKind } from "./sampleWorkflow";
import { DEFAULT_STAGE_BY_KIND, type WorkflowMode } from "./promptPresets";

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

function nextNodePosition(document: CanvasDocument) {
  const baseX = 240 + (document.nodes.length % 4) * 360;
  const baseY = 180 + Math.floor(document.nodes.length / 4) * 220;
  return { x: baseX, y: baseY };
}

function buildNode(kind: CanvasNodeKind, title: string, description: string, document: CanvasDocument): CanvasNode {
  const pos = nextNodePosition(document);
  const stageKey = DEFAULT_STAGE_BY_KIND[kind] ?? "script";
  return {
    id: buildId("node"),
    kind,
    title,
    subtitle: stageKey,
    description,
    status: "draft",
    x: pos.x,
    y: pos.y,
    tags: [],
    fields: {}
  };
}

function createWorkflowBranch(mode: WorkflowMode, idea: string, document: CanvasDocument) {
  const prefix = mode === "explainer" ? "解说漫" : mode === "story" ? "剧本漫" : mode === "liveAction" ? "真人短剧" : "图文说";
  const episode = buildNode("episode", `${prefix}目标`, `围绕“${idea}”创建新的工作流分支。`, document);
  const script = buildNode("script", "脚本节点", "承接创意，负责脚本与钩子。", document);
  const character = buildNode("character", "角色节点", "提炼角色身份和视觉锚点。", document);
  const storyboard = buildNode("prompt", "分镜节点", "拆解成 beat 和镜头计划。", document);
  const image = buildNode("image", "关键帧节点", "准备关键帧和参考图。", document);
  const video = buildNode("video", "视频节点", "把关键帧转成真动态镜头。", document);
  const audio = buildNode("audio", "音频节点", "旁白、对白和音效。", document);

  const nodes = [episode, script, character, storyboard, image, video, audio];
  const edges: CanvasEdge[] = [
    { id: buildId("edge"), source: episode.id, target: script.id, label: "创意" },
    { id: buildId("edge"), source: episode.id, target: character.id, label: "人设" },
    { id: buildId("edge"), source: script.id, target: storyboard.id, label: "拆分镜头" },
    { id: buildId("edge"), source: character.id, target: image.id, label: "定角色图" },
    { id: buildId("edge"), source: storyboard.id, target: image.id, label: "关键帧" },
    { id: buildId("edge"), source: image.id, target: video.id, label: "生成视频" },
    { id: buildId("edge"), source: script.id, target: audio.id, label: "旁白与对白" }
  ];
  return { nodes, edges };
}

export async function runAssistantTurn(options: AssistantRunOptions) {
  const { sessionId, message, mode, document, selectedNode, emit, mutate } = options;
  const normalized = message.trim();

  await emit({ kind: "session", sessionId });

  if (!normalized) {
    await streamAssistantMessage(emit, "说一个明确动作，我才能在画布上执行。比如：创建第2集工作流、优化当前节点、删除选中节点。");
    await emit({ kind: "done" });
    return;
  }

  if (/删除|remove|delete/.test(normalized)) {
    if (!selectedNode) {
      await streamAssistantMessage(emit, "你想删节点，但当前没有选中节点。先在画布上选中一个节点，我再执行。");
      await emit({ kind: "done" });
      return;
    }
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

  if (/创建|新建|搭一个|来一套|workflow|工作流/.test(normalized)) {
    const branchIdea = normalized.replace(/创建|新建|搭一个|来一套|workflow|工作流/g, "").trim() || "新的短视频项目";
    const { nodes, edges } = createWorkflowBranch(mode, branchIdea, document);
    await emit({
      kind: "tool",
      tool: {
        id: buildId("tool"),
        toolName: "canvas.createItems",
        status: "running",
        summary: `正在根据你的需求创建 ${nodes.length} 个节点和 ${edges.length} 条连线。`
      }
    });
    nodes.forEach((node) => mutate.addNode(node));
    edges.forEach((edge) => mutate.addEdge(edge));
    nodes.forEach((node) => mutate.createVersion(node.id, "由助手创建工作流骨架", "assistant"));
    await emit({
      kind: "tool",
      tool: {
        id: buildId("tool"),
        toolName: "canvas.createItems",
        status: "completed",
        summary: `已创建新的「${branchIdea}」工作流骨架。`
      }
    });
    await streamAssistantMessage(
      emit,
      `我已经在画布上搭好一套新的工作流骨架。下一步先选中脚本节点或角色节点，我可以继续帮你补全文本、角色锚点或提示词。`
    );
    await emit({ kind: "done" });
    return;
  }

  if (/补全|优化|改写|提示词|prompt/.test(normalized) && selectedNode) {
    const stage = DEFAULT_STAGE_BY_KIND[selectedNode.kind] ?? "script";
    const nextDescription = `${selectedNode.description}\n\n[助手补充] 当前节点建议继续沿着「${stage}」模板细化，重点是：${normalized}`;
    mutate.updateNode(selectedNode.id, {
      description: nextDescription,
      status: selectedNode.status === "draft" ? "review" : selectedNode.status,
      fields: {
        ...selectedNode.fields,
        assistant_note: normalized
      }
    });
    mutate.createVersion(selectedNode.id, `助手优化了 ${selectedNode.title}`, "assistant");
    await emit({
      kind: "tool",
      tool: {
        id: buildId("tool"),
        toolName: "canvas.updateItem",
        status: "completed",
        summary: `已更新节点「${selectedNode.title}」并写入可回滚历史。`
      }
    });
    await streamAssistantMessage(
      emit,
      `我已经基于当前节点补了一轮建议。你现在可以继续编辑它，或者让我继续帮你补下游节点。`
    );
    await emit({ kind: "done" });
    return;
  }

  if (/重跑|卡顿|声音|优化建议|修复/.test(normalized)) {
    const note = buildNode(
      "note",
      "助手建议",
      "重镜头只保留关键动作；轻镜头承担信息推进；旁白换更冷更克制的男声；字幕上浮并放大；封面帧必须单独设计。",
      document
    );
    mutate.addNode(note);
    mutate.createVersion(note.id, "助手写入优化建议", "assistant");
    await emit({
      kind: "tool",
      tool: {
        id: buildId("tool"),
        toolName: "canvas.createItem",
        status: "completed",
        summary: "已把优化建议写成画布节点。"
      }
    });
    await streamAssistantMessage(
      emit,
      "我把这轮优化建议写成了一个节点。你可以把它连到视频、音频或剪辑节点，作为后续返工依据。"
    );
    await emit({ kind: "done" });
    return;
  }

  await streamAssistantMessage(
    emit,
    "我已经收到你的意图。当前最合适的动作是：创建新工作流、补全当前节点、删除当前节点，或者把优化建议落成节点。你直接说其中一种即可。"
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
    await emit({
      kind: "tool",
      tool: {
        id: buildId("tool"),
        toolName: "canvas.deleteItem",
        status: "completed",
        summary: "节点已删除。"
      }
    });
    await streamAssistantMessage(emit, "节点已经从画布中移除，关联连线也一起清理了。");
  } else {
    await streamAssistantMessage(emit, "已取消这次删除操作，画布没有变更。");
  }
  await emit({ kind: "done" });
}
