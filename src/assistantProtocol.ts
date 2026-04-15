import type { CanvasDocument, CanvasEdge, CanvasNode, CanvasNodeKind } from "./sampleWorkflow";
import type { WorkflowMode } from "./promptPresets";

export interface AssistantProtocolAction {
  id: string;
  label: string;
  description: string;
  matcher: string;
  requiresSelection?: boolean;
  interruptOnExecute?: boolean;
}

export interface AssistantProtocol {
  systemPrompt: string;
  quickActions: Array<{
    id: string;
    label: string;
    message: string;
  }>;
  actions: AssistantProtocolAction[];
}

export interface AssistantRuntimeContext {
  mode: WorkflowMode;
  document: CanvasDocument;
  selectedNode: CanvasNode | null;
}

export function buildAssistantProtocol(): AssistantProtocol {
  return {
    systemPrompt:
      "你是独立画布工作台里的 AI 漫剧助手。你的首要目标不是闲聊，而是驱动画布工作流向前推进。你必须优先帮助用户创建节点、修改节点、追加建议、连接节点、保留历史和引导下一步。你遵循方案B：借结构，不照搬平台。优先支持 AI 解说漫、剧本漫、真人短剧和图文说四种模式。任何删除动作必须先中断确认。任何涉及大批量创建的请求，优先创建一整套工作流骨架，而不是零散回复。",
    quickActions: [
      { id: "create-workflow", label: "创建工作流", message: "创建一套新工作流" },
      { id: "optimize-node", label: "优化当前节点", message: "优化当前节点" },
      { id: "write-note", label: "写优化建议", message: "把优化建议写到画布上" },
      { id: "delete-node", label: "删除当前节点", message: "删除当前节点" }
    ],
    actions: [
      {
        id: "delete-selected-node",
        label: "删除节点",
        description: "删除当前选中的节点并清理关联连线",
        matcher: "删除|remove|delete",
        requiresSelection: true,
        interruptOnExecute: true
      },
      {
        id: "create-workflow-branch",
        label: "创建工作流",
        description: "根据用户意图创建一套新的工作流骨架",
        matcher: "创建|新建|搭一个|来一套|workflow|工作流"
      },
      {
        id: "optimize-selected-node",
        label: "优化节点",
        description: "基于当前节点补充优化建议和模板方向",
        matcher: "补全|优化|改写|提示词|prompt",
        requiresSelection: true
      },
      {
        id: "write-repair-note",
        label: "写优化建议",
        description: "把返工建议、卡顿修复建议写成画布节点",
        matcher: "重跑|卡顿|声音|优化建议|修复"
      }
    ]
  };
}

export function matchProtocolAction(
  message: string,
  protocol: AssistantProtocol
): AssistantProtocolAction | null {
  const normalized = String(message || "").trim();
  for (const action of protocol.actions) {
    try {
      const pattern = new RegExp(action.matcher, "i");
      if (pattern.test(normalized)) {
        return action;
      }
    } catch {
      continue;
    }
  }
  return null;
}

export function nextNodePosition(document: CanvasDocument) {
  const baseX = 240 + (document.nodes.length % 4) * 360;
  const baseY = 180 + Math.floor(document.nodes.length / 4) * 220;
  return { x: baseX, y: baseY };
}

export function buildProtocolNode(
  kind: CanvasNodeKind,
  title: string,
  description: string,
  document: CanvasDocument
) {
  const pos = nextNodePosition(document);
  return {
    id: `node-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    kind,
    title,
    subtitle: kind,
    description,
    status: "draft" as const,
    x: pos.x,
    y: pos.y,
    tags: [],
    fields: {}
  };
}

export function createWorkflowBranchFromProtocol(
  mode: WorkflowMode,
  idea: string,
  document: CanvasDocument
) {
  const prefix =
    mode === "explainer"
      ? "解说漫"
      : mode === "story"
        ? "剧本漫"
        : mode === "liveAction"
          ? "真人短剧"
          : "图文说";

  const episode = buildProtocolNode("episode", `${prefix}目标`, `围绕“${idea}”创建新的工作流分支。`, document);
  const script = buildProtocolNode("script", "脚本节点", "承接创意，负责脚本与钩子。", document);
  const character = buildProtocolNode("character", "角色节点", "提炼角色身份和视觉锚点。", document);
  const storyboard = buildProtocolNode("prompt", "分镜节点", "拆解成 beat 和镜头计划。", document);
  const image = buildProtocolNode("image", "关键帧节点", "准备关键帧和参考图。", document);
  const video = buildProtocolNode("video", "视频节点", "把关键帧转成真动态镜头。", document);
  const audio = buildProtocolNode("audio", "音频节点", "旁白、对白和音效。", document);

  const nodes = [episode, script, character, storyboard, image, video, audio];
  const edges: CanvasEdge[] = [
    { id: `edge-${Date.now()}-1`, source: episode.id, target: script.id, label: "创意" },
    { id: `edge-${Date.now()}-2`, source: episode.id, target: character.id, label: "人设" },
    { id: `edge-${Date.now()}-3`, source: script.id, target: storyboard.id, label: "拆分镜头" },
    { id: `edge-${Date.now()}-4`, source: character.id, target: image.id, label: "定角色图" },
    { id: `edge-${Date.now()}-5`, source: storyboard.id, target: image.id, label: "关键帧" },
    { id: `edge-${Date.now()}-6`, source: image.id, target: video.id, label: "生成视频" },
    { id: `edge-${Date.now()}-7`, source: script.id, target: audio.id, label: "旁白与对白" }
  ];

  return { nodes, edges };
}
