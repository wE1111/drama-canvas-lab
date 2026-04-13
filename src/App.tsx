import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";

import {
  runAssistantTurn,
  resolveAssistantInterrupt,
  type AssistantEvent,
  type AssistantInterrupt,
  type AssistantMessage,
  type AssistantMutationAPI,
  type AssistantToolEvent
} from "./assistantMock";
import { PROMPT_PACKS, DEFAULT_STAGE_BY_KIND, type PromptPack, type PromptStage, type WorkflowMode } from "./promptPresets";
import { createStarterDocuments, starterDocument, type CanvasDocument, type CanvasEdge, type CanvasNode } from "./sampleWorkflow";

const STORAGE_KEY = "drama-canvas-lab.document.v1";
const DOCS_KEY = "drama-canvas-lab.documents.v1";
const ACTIVE_DOC_KEY = "drama-canvas-lab.active-doc.v1";
const MODE_KEY = "drama-canvas-lab.mode.v1";
const TEMPLATE_KEY = "drama-canvas-lab.templates.v1";
const HISTORY_KEY = "drama-canvas-lab.history.v1";
const GENERATIONS_KEY = "drama-canvas-lab.generations.v1";
const QUEUE_KEY = "drama-canvas-lab.queue.v1";

const BOARD_WIDTH = 5200;
const BOARD_HEIGHT = 3200;
const NODE_WIDTH = 268;
const NODE_HEIGHT = 150;

type RailTab = "assistant" | "inspector" | "templates";
type HistorySource = "manual" | "assistant" | "generation";

interface NodeVersion {
  id: string;
  nodeId: string;
  createdAt: string;
  source: HistorySource;
  note: string;
  snapshot: CanvasNode;
}

type HistoryMap = Record<string, NodeVersion[]>;

type GenerationKind = "text" | "image" | "video" | "audio";

interface NodeGeneration {
  id: string;
  nodeId: string;
  kind: GenerationKind;
  createdAt: string;
  provider: string;
  summary: string;
  prompt: string;
  applied: boolean;
  output: {
    text?: string;
    previewUrl?: string;
    durationSec?: number;
  };
}

type GenerationMap = Record<string, NodeGeneration[]>;

interface RunQueueItem {
  id: string;
  nodeId: string;
  nodeTitle: string;
  kind: GenerationKind;
  provider: string;
  status: "queued" | "running" | "done";
  createdAt: string;
  finishedAt?: string;
  summary: string;
}

type DragState =
  | { mode: "pan"; startX: number; startY: number; baseX: number; baseY: number }
  | { mode: "node"; nodeId: string; offsetX: number; offsetY: number }
  | null;

function buildId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function cloneNode(node: CanvasNode): CanvasNode {
  return JSON.parse(JSON.stringify(node)) as CanvasNode;
}

function createInitialHistory(document: CanvasDocument): HistoryMap {
  const map: HistoryMap = {};
  for (const node of document.nodes) {
    map[node.id] = [
      {
        id: buildId("version"),
        nodeId: node.id,
        createdAt: new Date().toISOString(),
        source: "manual",
        note: "初始节点",
        snapshot: cloneNode(node)
      }
    ];
  }
  return map;
}

function createSvgDataUri({
  title,
  subtitle,
  accent,
  kind
}: {
  title: string;
  subtitle: string;
  accent: string;
  kind: string;
}) {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="900" height="1600" viewBox="0 0 900 1600">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#07111d" />
        <stop offset="100%" stop-color="#111c2f" />
      </linearGradient>
      <radialGradient id="glow" cx="0.2" cy="0.1" r="0.9">
        <stop offset="0%" stop-color="${accent}" stop-opacity="0.45" />
        <stop offset="100%" stop-color="${accent}" stop-opacity="0" />
      </radialGradient>
    </defs>
    <rect width="900" height="1600" fill="url(#bg)" />
    <rect width="900" height="1600" fill="url(#glow)" />
    <rect x="58" y="58" width="784" height="1484" rx="42" fill="rgba(4,8,16,0.72)" stroke="rgba(255,255,255,0.12)" />
    <text x="92" y="140" fill="${accent}" font-size="30" font-family="Arial, sans-serif" letter-spacing="6">${kind.toUpperCase()}</text>
    <text x="92" y="260" fill="#f3f7ff" font-size="68" font-family="Arial, sans-serif" font-weight="700">${title}</text>
    <text x="92" y="340" fill="#9fb0c8" font-size="28" font-family="Arial, sans-serif">${subtitle}</text>
    <circle cx="742" cy="180" r="74" fill="${accent}" opacity="0.18" />
    <circle cx="742" cy="180" r="42" fill="${accent}" opacity="0.42" />
    <rect x="92" y="1210" width="716" height="178" rx="24" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" />
    <text x="122" y="1288" fill="#f3f7ff" font-size="34" font-family="Arial, sans-serif">Generated preview</text>
    <text x="122" y="1340" fill="#9fb0c8" font-size="24" font-family="Arial, sans-serif">This is a mock asset shell for the canvas workbench.</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function inferGenerationKind(node: CanvasNode): GenerationKind {
  if (node.kind === "video" || node.kind === "edit") return "video";
  if (node.kind === "audio") return "audio";
  if (node.kind === "image" || node.kind === "character" || node.kind === "scene") return "image";
  return "text";
}

function createGenerationPayload(node: CanvasNode, mode: WorkflowMode, templates: Record<WorkflowMode, PromptPack>): NodeGeneration {
  const kind = inferGenerationKind(node);
  const stage = DEFAULT_STAGE_BY_KIND[node.kind] ?? "script";
  const prompt = templates[mode].stages[stage];
  const title = `${node.title} · ${kind}`;
  const subtitle = `${templates[mode].label} / ${stage}`;
  const accent = kind === "video" ? "#ff9bb2" : kind === "audio" ? "#9fe089" : kind === "image" ? "#90f5ff" : "#ffd36e";
  const previewUrl = kind === "text" ? undefined : createSvgDataUri({ title, subtitle, accent, kind });
  const text = kind === "text"
    ? `【${templates[mode].label}】默认模板已为「${node.title}」生成一版草稿，可继续细化。\n\n模板阶段：${stage}\n\n${prompt}`
    : undefined;

  return {
    id: buildId("gen"),
    nodeId: node.id,
    kind,
    createdAt: new Date().toISOString(),
    provider: kind === "video" ? "Vidu" : kind === "image" ? "Nano Banana / Vidu" : kind === "audio" ? "Vidu TTS" : "Assistant Draft",
    summary: `已生成一条 ${kind} 结果，可应用到当前节点。`,
    prompt,
    applied: false,
    output: {
      text,
      previewUrl,
      durationSec: kind === "video" ? 4 : kind === "audio" ? 18 : undefined
    }
  };
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function statusColor(status: string) {
  if (status === "done") return "#79f2c0";
  if (status === "running") return "#6ae3ff";
  if (status === "review") return "#ffb86a";
  if (status === "blocked") return "#ff6b8f";
  return "#78859b";
}

function kindAccent(kind: string) {
  const mapping: Record<string, string> = {
    episode: "#87a9ff",
    script: "#8ef3d0",
    character: "#ffd36e",
    scene: "#8fd4ff",
    prompt: "#c7a0ff",
    image: "#90f5ff",
    video: "#ff9bb2",
    audio: "#9fe089",
    edit: "#f4acff",
    publish: "#ffa06d",
    note: "#9ca8bb"
  };
  return mapping[kind] ?? "#90f5ff";
}

function edgePath(source: CanvasNode, target: CanvasNode) {
  const x1 = source.x + NODE_WIDTH;
  const y1 = source.y + NODE_HEIGHT / 2;
  const x2 = target.x;
  const y2 = target.y + NODE_HEIGHT / 2;
  const c1 = x1 + Math.max(80, (x2 - x1) / 2);
  const c2 = x2 - Math.max(80, (x2 - x1) / 2);
  return `M ${x1} ${y1} C ${c1} ${y1}, ${c2} ${y2}, ${x2} ${y2}`;
}

function buildNewNode(document: CanvasDocument): CanvasNode {
  const index = document.nodes.length;
  return {
    id: buildId("node"),
    kind: "note",
    title: `新节点 ${index + 1}`,
    subtitle: "note",
    description: "在检查器里修改这个节点的用途。",
    status: "draft",
    x: 180 + (index % 4) * 320,
    y: 180 + Math.floor(index / 4) * 220,
    tags: [],
    fields: {}
  };
}

function parseTags(input: string) {
  return input
    .split(/[，,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function App() {
  const [documents, setDocuments] = useState<CanvasDocument[]>(createStarterDocuments());
  const [activeDocumentId, setActiveDocumentId] = useState<string>(starterDocument.id || "default");
  const [document, setDocument] = useState<CanvasDocument>(starterDocument);
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>("explainer");
  const [templates, setTemplates] = useState<Record<WorkflowMode, PromptPack>>(PROMPT_PACKS as Record<WorkflowMode, PromptPack>);
  const [historyMap, setHistoryMap] = useState<HistoryMap>(() => createInitialHistory(starterDocument));
  const [generationMap, setGenerationMap] = useState<GenerationMap>({});
  const [runQueue, setRunQueue] = useState<RunQueueItem[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(starterDocument.nodes[0]?.id ?? null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [railTab, setRailTab] = useState<RailTab>("assistant");
  const [dragState, setDragState] = useState<DragState>(null);
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([
    {
      id: buildId("msg"),
      role: "assistant",
      content: "右侧助手已接管。你可以让我创建工作流、补全当前节点、写优化建议，或确认删除节点。"
    }
  ]);
  const [assistantTools, setAssistantTools] = useState<AssistantToolEvent[]>([]);
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantStatus, setAssistantStatus] = useState<"idle" | "streaming" | "waiting">("idle");
  const [assistantSessionId, setAssistantSessionId] = useState(() => buildId("session"));
  const [assistantInterrupt, setAssistantInterrupt] = useState<AssistantInterrupt | null>(null);
  const [message, setMessage] = useState("独立画布工作台已启动。当前方向：借结构，不照搬平台。");
  const [newEdgeSource, setNewEdgeSource] = useState("");
  const [newEdgeTarget, setNewEdgeTarget] = useState("");
  const [newEdgeLabel, setNewEdgeLabel] = useState("主流程");
  const [templateStage, setTemplateStage] = useState<PromptStage>("script");
  const [historyNote, setHistoryNote] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const starterDocs = createStarterDocuments();
    const nextDocuments = loadJson<CanvasDocument[]>(DOCS_KEY, starterDocs);
    const nextActiveDocId = loadJson<string>(ACTIVE_DOC_KEY, starterDocs[0]?.id || starterDocument.id || "default");
    const nextDocument =
      nextDocuments.find((doc) => doc.id === nextActiveDocId) ??
      nextDocuments[0] ??
      starterDocument;
    const nextMode = loadJson<WorkflowMode>(MODE_KEY, "explainer");
    const nextTemplates = loadJson<Record<WorkflowMode, PromptPack>>(TEMPLATE_KEY, PROMPT_PACKS as Record<WorkflowMode, PromptPack>);
    const nextHistory = loadJson<HistoryMap>(HISTORY_KEY, createInitialHistory(nextDocument));
    const nextGenerations = loadJson<GenerationMap>(GENERATIONS_KEY, {});
    const nextQueue = loadJson<RunQueueItem[]>(QUEUE_KEY, []);

    setDocuments(nextDocuments);
    setActiveDocumentId(nextDocument.id || nextActiveDocId);
    setDocument(nextDocument);
    setWorkflowMode(nextMode);
    setTemplates(nextTemplates);
    setHistoryMap(nextHistory);
    setGenerationMap(nextGenerations);
    setRunQueue(nextQueue);
    setSelectedNodeId(nextDocument.nodes[0]?.id ?? null);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(document));
    setDocuments((current) => {
      const next = current.map((doc) => (doc.id === document.id ? document : doc));
      if (!next.some((doc) => doc.id === document.id)) {
        next.push(document);
      }
      return next;
    });
  }, [document]);

  useEffect(() => {
    window.localStorage.setItem(DOCS_KEY, JSON.stringify(documents));
  }, [documents]);

  useEffect(() => {
    window.localStorage.setItem(ACTIVE_DOC_KEY, JSON.stringify(activeDocumentId));
  }, [activeDocumentId]);

  useEffect(() => {
    window.localStorage.setItem(MODE_KEY, JSON.stringify(workflowMode));
  }, [workflowMode]);

  useEffect(() => {
    window.localStorage.setItem(TEMPLATE_KEY, JSON.stringify(templates));
  }, [templates]);

  useEffect(() => {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(historyMap));
  }, [historyMap]);

  useEffect(() => {
    window.localStorage.setItem(GENERATIONS_KEY, JSON.stringify(generationMap));
  }, [generationMap]);

  useEffect(() => {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(runQueue));
  }, [runQueue]);

  const selectedNode = useMemo(
    () => document.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [document.nodes, selectedNodeId]
  );
  const selectedEdge = useMemo(
    () => document.edges.find((edge) => edge.id === selectedEdgeId) ?? null,
    [document.edges, selectedEdgeId]
  );

  function createVersion(nodeId: string, note: string, source: HistorySource) {
    const node = document.nodes.find((entry) => entry.id === nodeId);
    if (!node) return;
    setHistoryMap((current) => ({
      ...current,
      [nodeId]: [
        {
          id: buildId("version"),
          nodeId,
          createdAt: new Date().toISOString(),
          source,
          note: note || "未命名变更",
          snapshot: cloneNode(node)
        },
        ...(current[nodeId] ?? [])
      ]
    }));
  }

  function setDocumentNodes(nodes: CanvasNode[]) {
    setDocument((current) => ({ ...current, nodes }));
  }

  function setDocumentEdges(edges: CanvasEdge[]) {
    setDocument((current) => ({ ...current, edges }));
  }

  const mutationAPI: AssistantMutationAPI = {
    addNode(node) {
      setDocument((current) => ({ ...current, nodes: [...current.nodes, node] }));
    },
    updateNode(nodeId, patch) {
      setDocument((current) => ({
        ...current,
        nodes: current.nodes.map((node) => (node.id === nodeId ? { ...node, ...patch } : node))
      }));
    },
    deleteNode(nodeId) {
      setDocument((current) => ({
        ...current,
        nodes: current.nodes.filter((node) => node.id !== nodeId),
        edges: current.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId)
      }));
      setSelectedNodeId((current) => (current === nodeId ? null : current));
    },
    addEdge(edge) {
      setDocument((current) => ({ ...current, edges: [...current.edges, edge] }));
    },
    createVersion
  };

  function patchNode(nodeId: string, patch: Partial<CanvasNode>, note = "手动修改") {
    setDocument((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === nodeId ? { ...node, ...patch } : node))
    }));
    createVersion(nodeId, note, "manual");
  }

  function addNode() {
    const node = buildNewNode(document);
    setDocument((current) => ({ ...current, nodes: [...current.nodes, node] }));
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
    setRailTab("inspector");
    setMessage("已新增节点。你可以在右侧检查器里继续改。");
  }

  function addDocument() {
    const base = buildNewNode(document);
    const newDoc: CanvasDocument = {
      id: buildId("doc"),
      title: `新工作流 ${documents.length + 1}`,
      summary: "从空白文档开始的新工作流。",
      viewport: { x: 120, y: 96, zoom: 1 },
      nodes: [
        {
          ...base,
          kind: "episode",
          title: "起点节点",
          subtitle: "episode",
          description: "从这里开始定义你的新内容目标。",
          fields: { platform: "douyin", runtime: "30s" }
        }
      ],
      edges: []
    };
    setDocuments((current) => [...current, newDoc]);
    setDocument(newDoc);
    setActiveDocumentId(newDoc.id || "");
    setSelectedNodeId(newDoc.nodes[0]?.id ?? null);
    setSelectedEdgeId(null);
    setMessage("已创建新文档。");
  }

  function switchDocument(documentId: string) {
    const next = documents.find((doc) => doc.id === documentId);
    if (!next) return;
    setDocument(JSON.parse(JSON.stringify(next)) as CanvasDocument);
    setActiveDocumentId(documentId);
    setSelectedNodeId(next.nodes[0]?.id ?? null);
    setSelectedEdgeId(null);
    setMessage(`已切换到「${next.title}」。`);
  }

  function duplicateSelectedNode() {
    if (!selectedNode) return;
    const duplicate = cloneNode(selectedNode);
    duplicate.id = buildId("node");
    duplicate.title = `${selectedNode.title} 副本`;
    duplicate.x += 36;
    duplicate.y += 28;
    setDocument((current) => ({ ...current, nodes: [...current.nodes, duplicate] }));
    setSelectedNodeId(duplicate.id);
    setMessage("已复制当前节点。");
  }

  function deleteSelectedNode() {
    if (!selectedNode) return;
    mutationAPI.deleteNode(selectedNode.id);
    setMessage("节点已删除。");
  }

  function addEdge() {
    if (!newEdgeSource || !newEdgeTarget || newEdgeSource === newEdgeTarget) {
      setMessage("请选择有效的起点和终点。");
      return;
    }
    const edge: CanvasEdge = {
      id: buildId("edge"),
      source: newEdgeSource,
      target: newEdgeTarget,
      label: newEdgeLabel.trim()
    };
    setDocument((current) => ({ ...current, edges: [...current.edges, edge] }));
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
    setMessage("连线已新增。");
  }

  function deleteSelectedEdge() {
    if (!selectedEdgeId) return;
    setDocument((current) => ({
      ...current,
      edges: current.edges.filter((edge) => edge.id !== selectedEdgeId)
    }));
    setSelectedEdgeId(null);
    setMessage("连线已删除。");
  }

  function applyVersion(version: NodeVersion) {
    setDocument((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === version.nodeId ? cloneNode(version.snapshot) : node))
    }));
    setSelectedNodeId(version.nodeId);
    setRailTab("inspector");
    setMessage(`已应用历史版本：${version.note}`);
  }

  function saveManualVersion() {
    if (!selectedNode) return;
    createVersion(selectedNode.id, historyNote.trim() || "手动保存版本", "manual");
    setHistoryNote("");
    setMessage("当前节点已保存为新版本。");
  }

  function generateForSelectedNode() {
    if (!selectedNode) return;
    const generation = createGenerationPayload(selectedNode, workflowMode, templates);
    const runId = buildId("run");
    const createdAt = new Date().toISOString();
    setRunQueue((current) => [
      {
        id: runId,
        nodeId: selectedNode.id,
        nodeTitle: selectedNode.title,
        kind: generation.kind,
        provider: generation.provider,
        status: "running",
        createdAt,
        summary: generation.summary
      },
      ...current
    ]);
    setMessage(`已提交「${selectedNode.title}」的 ${generation.kind} 生成任务。`);
    window.setTimeout(() => {
      setGenerationMap((current) => ({
        ...current,
        [selectedNode.id]: [generation, ...(current[selectedNode.id] ?? [])]
      }));
      setRunQueue((current) =>
        current.map((item) =>
          item.id === runId ? { ...item, status: "done", finishedAt: new Date().toISOString() } : item
        )
      );
      setMessage(`「${selectedNode.title}」的 ${generation.kind} 结果已生成。`);
    }, 900);
  }

  function applyGeneration(nodeId: string, generationId: string) {
    const generation = (generationMap[nodeId] ?? []).find((entry) => entry.id === generationId);
    const node = document.nodes.find((entry) => entry.id === nodeId);
    if (!generation || !node) return;

    const nextFields: Record<string, string> = {
      ...node.fields,
      active_generation_id: generation.id,
      generation_provider: generation.provider,
      generation_prompt: generation.prompt,
      generation_kind: generation.kind
    };

    if (generation.output.previewUrl) {
      nextFields.preview_url = generation.output.previewUrl;
    }
    if (generation.output.text) {
      nextFields.generated_text = generation.output.text;
    }
    if (generation.output.durationSec) {
      nextFields.duration = String(generation.output.durationSec);
    }

    patchNode(
      nodeId,
      {
        status: node.status === "draft" ? "review" : node.status,
        subtitle: `${node.subtitle || ""}${node.subtitle ? " · " : ""}${generation.provider}`.slice(0, 64),
        fields: nextFields,
        description:
          generation.kind === "text"
            ? generation.output.text ?? node.description
            : `${node.description}\n\n[已应用生成结果] ${generation.summary}`
      },
      `应用生成结果：${generation.summary}`
    );

    setGenerationMap((current) => ({
      ...current,
      [nodeId]: (current[nodeId] ?? []).map((entry) => ({
        ...entry,
        applied: entry.id === generationId
      }))
    }));
    setMessage(`已把生成结果应用到「${node.title}」。`);
  }

  function applyTemplateToNode() {
    if (!selectedNode) return;
    const stage = DEFAULT_STAGE_BY_KIND[selectedNode.kind] ?? templateStage;
    const template = templates[workflowMode].stages[templateStage];
    patchNode(
      selectedNode.id,
      {
        fields: {
          ...selectedNode.fields,
          [`${stage}_template`]: template
        },
        subtitle: stage
      },
      `应用 ${templates[workflowMode].label} / ${templateStage} 默认模板`
    );
    setMessage(`已把 ${templateStage} 默认模板写入当前节点。`);
  }

  function restorePromptPack() {
    setTemplates((current) => ({
      ...current,
      [workflowMode]: PROMPT_PACKS[workflowMode]
    }));
    setMessage("已恢复当前模式的默认提示词模板。");
  }

  async function handleAssistantSend() {
    const content = assistantInput.trim();
    if (!content || assistantStatus !== "idle") return;
    const userMessage: AssistantMessage = { id: buildId("msg"), role: "user", content };
    setAssistantMessages((current) => [...current, userMessage]);
    setAssistantInput("");
    setAssistantStatus("streaming");

    let activeAssistantMessageId = "";
    const emit = async (event: AssistantEvent) => {
      if (event.kind === "session") {
        setAssistantSessionId(event.sessionId);
        return;
      }
      if (event.kind === "tool") {
        setAssistantTools((current) => {
          const next = current.filter((item) => item.id !== event.tool.id);
          return [event.tool, ...next].slice(0, 8);
        });
        return;
      }
      if (event.kind === "messageDelta") {
        activeAssistantMessageId = event.messageId;
        setAssistantMessages((current) => {
          const exists = current.find((item) => item.id === event.messageId);
          if (exists) {
            return current.map((item) =>
              item.id === event.messageId ? { ...item, content: `${item.content}${event.delta}` } : item
            );
          }
          return [...current, { id: event.messageId, role: "assistant", content: event.delta }];
        });
        return;
      }
      if (event.kind === "messageCompleted") {
        setAssistantMessages((current) => {
          const exists = current.find((item) => item.id === event.message.id);
          if (exists) {
            return current.map((item) => (item.id === event.message.id ? event.message : item));
          }
          return [...current, event.message];
        });
        return;
      }
      if (event.kind === "interrupt") {
        setAssistantInterrupt(event.interrupt);
        setAssistantStatus("waiting");
        return;
      }
      if (event.kind === "interruptResolved") {
        setAssistantInterrupt(null);
        return;
      }
      if (event.kind === "done") {
        setAssistantStatus((current) => (current === "waiting" ? "waiting" : "idle"));
        if (!assistantInterrupt) {
          setAssistantStatus("idle");
        }
      }
    };

    await runAssistantTurn({
      sessionId: assistantSessionId,
      message: content,
      mode: workflowMode,
      document,
      selectedNode,
      emit,
      mutate: mutationAPI
    });

    if (!assistantInterrupt) {
      setAssistantStatus("idle");
    }
    if (activeAssistantMessageId) {
      setMessage("助手已处理当前指令。");
    }
  }

  async function handleInterruptDecision(decision: "approve" | "reject") {
    if (!assistantInterrupt) return;
    setAssistantStatus("streaming");
    await resolveAssistantInterrupt(assistantInterrupt, decision, async (event) => {
      if (event.kind === "tool") {
        setAssistantTools((current) => [event.tool, ...current.filter((item) => item.id !== event.tool.id)].slice(0, 8));
      } else if (event.kind === "messageDelta") {
        setAssistantMessages((current) => {
          const exists = current.find((item) => item.id === event.messageId);
          if (exists) {
            return current.map((item) =>
              item.id === event.messageId ? { ...item, content: `${item.content}${event.delta}` } : item
            );
          }
          return [...current, { id: event.messageId, role: "assistant", content: event.delta }];
        });
      } else if (event.kind === "messageCompleted") {
        setAssistantMessages((current) => {
          const exists = current.find((item) => item.id === event.message.id);
          if (exists) {
            return current.map((item) => (item.id === event.message.id ? event.message : item));
          }
          return [...current, event.message];
        });
      } else if (event.kind === "interruptResolved") {
        setAssistantInterrupt(null);
      } else if (event.kind === "done") {
        setAssistantStatus("idle");
      }
    }, mutationAPI);
    setAssistantStatus("idle");
  }

  function exportDocument() {
    const blob = new Blob([JSON.stringify({ document, workflowMode, templates, historyMap }, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const anchor = globalThis.document.createElement("a");
    anchor.href = url;
    anchor.download = "drama-canvas-workbench.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage("已导出当前工作台 JSON。");
  }

  function resetDocument() {
    setDocument(starterDocument);
    setHistoryMap(createInitialHistory(starterDocument));
    setSelectedNodeId(starterDocument.nodes[0]?.id ?? null);
    setSelectedEdgeId(null);
    setMessage("已恢复默认示例工作流。");
  }

  function handleBackgroundPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setDragState({
      mode: "pan",
      startX: event.clientX,
      startY: event.clientY,
      baseX: document.viewport.x,
      baseY: document.viewport.y
    });
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragState) return;
    if (dragState.mode === "pan") {
      const dx = event.clientX - dragState.startX;
      const dy = event.clientY - dragState.startY;
      setDocument((current) => ({
        ...current,
        viewport: {
          ...current.viewport,
          x: dragState.baseX + dx,
          y: dragState.baseY + dy
        }
      }));
      return;
    }
    if (dragState.mode === "node") {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const canvasX = (event.clientX - rect.left - document.viewport.x) / document.viewport.zoom;
      const canvasY = (event.clientY - rect.top - document.viewport.y) / document.viewport.zoom;
      setDocumentNodes(
        document.nodes.map((node) =>
          node.id === dragState.nodeId
            ? {
                ...node,
                x: Math.max(0, Math.min(BOARD_WIDTH - NODE_WIDTH, canvasX - dragState.offsetX)),
                y: Math.max(0, Math.min(BOARD_HEIGHT - NODE_HEIGHT, canvasY - dragState.offsetY))
              }
            : node
        )
      );
    }
  }

  function handlePointerUp() {
    setDragState(null);
  }

  function handleNodePointerDown(event: PointerEvent<HTMLButtonElement>, node: CanvasNode) {
    event.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const canvasX = (event.clientX - rect.left - document.viewport.x) / document.viewport.zoom;
    const canvasY = (event.clientY - rect.top - document.viewport.y) / document.viewport.zoom;
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
    setRailTab("inspector");
    setDragState({
      mode: "node",
      nodeId: node.id,
      offsetX: canvasX - node.x,
      offsetY: canvasY - node.y
    });
  }

  function adjustZoom(delta: number) {
    setDocument((current) => ({
      ...current,
      viewport: {
        ...current.viewport,
        zoom: Math.min(1.8, Math.max(0.45, Number((current.viewport.zoom + delta).toFixed(2))))
      }
    }));
  }

  const currentPack = templates[workflowMode];
  const nodeHistory = selectedNode ? historyMap[selectedNode.id] ?? [] : [];
  const nodeGenerations = selectedNode ? generationMap[selectedNode.id] ?? [] : [];
  const activeGeneration = selectedNode
    ? nodeGenerations.find((item) => item.applied) ?? nodeGenerations[0] ?? null
    : null;
  const activeDocumentTitle = documents.find((doc) => doc.id === activeDocumentId)?.title ?? document.title;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">DC</div>
          <div>
            <div className="brand-eyebrow">Standalone Canvas Workbench</div>
            <h1>{activeDocumentTitle}</h1>
          </div>
        </div>
        <div className="topbar-actions">
          <div className="mode-switch">
            {documents.map((doc) => (
              <button
                key={doc.id}
                className={activeDocumentId === doc.id ? "mode-pill is-active" : "mode-pill"}
                onClick={() => switchDocument(doc.id || "")}
              >
                {doc.title}
              </button>
            ))}
            <button className="action-button ghost" onClick={addDocument}>+ 新文档</button>
          </div>
          <div className="mode-switch">
            {Object.values(PROMPT_PACKS).map((pack) => (
              <button
                key={pack.mode}
                className={workflowMode === pack.mode ? "mode-pill is-active" : "mode-pill"}
                onClick={() => {
                  setWorkflowMode(pack.mode);
                  setMessage(`已切换到 ${pack.label} 模式。`);
                }}
              >
                {pack.label}
              </button>
            ))}
          </div>
          <button className="action-button" onClick={addNode}>新增节点</button>
          <button className="action-button" onClick={exportDocument}>导出 JSON</button>
          <button className="action-button ghost" onClick={resetDocument}>恢复示例</button>
        </div>
      </header>

      <section className="hero">
        <div>
          <div className="hero-kicker">方案 B</div>
          <h2>{document.summary}</h2>
          <p>
            借 `ai-moive-studio` 的结构，但只保留你真正需要的几层：画布交互、右侧助手协议、节点级服务边界、生成历史与应用逻辑、可配置提示词模板。
          </p>
        </div>
        <div className="hero-meta">
          <div><span>节点</span><strong>{document.nodes.length}</strong></div>
          <div><span>连线</span><strong>{document.edges.length}</strong></div>
          <div><span>缩放</span><strong>{Math.round(document.viewport.zoom * 100)}%</strong></div>
        </div>
      </section>

      <main className="workspace">
        <section className="canvas-shell">
          <div className="canvas-toolbar">
            <div className="canvas-toolbar-left">
              <span className="status-chip">{message}</span>
            </div>
            <div className="canvas-toolbar-right">
              <button className="icon-button" onClick={() => adjustZoom(0.1)}>+</button>
              <button className="icon-button" onClick={() => adjustZoom(-0.1)}>-</button>
            </div>
          </div>
          <div
            ref={containerRef}
            className="canvas-stage"
            onPointerDown={handleBackgroundPointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            <div className="canvas-grid" />
            <div
              className="canvas-surface"
              style={{
                width: BOARD_WIDTH,
                height: BOARD_HEIGHT,
                transform: `translate(${document.viewport.x}px, ${document.viewport.y}px) scale(${document.viewport.zoom})`
              }}
            >
              <svg width={BOARD_WIDTH} height={BOARD_HEIGHT} className="edge-layer">
                <defs>
                  <marker id="arrowhead" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto">
                    <path d="M0,0 L12,6 L0,12 z" fill="rgba(143, 220, 255, 0.85)" />
                  </marker>
                </defs>
                {document.edges.map((edge) => {
                  const source = document.nodes.find((node) => node.id === edge.source);
                  const target = document.nodes.find((node) => node.id === edge.target);
                  if (!source || !target) return null;
                  const selected = edge.id === selectedEdgeId;
                  const midX = (source.x + target.x + NODE_WIDTH) / 2;
                  const midY = (source.y + target.y + NODE_HEIGHT) / 2;
                  return (
                    <g key={edge.id} onClick={() => { setSelectedEdgeId(edge.id); setSelectedNodeId(null); setRailTab("inspector"); }}>
                      <path
                        d={edgePath(source, target)}
                        fill="none"
                        stroke={selected ? "#ffd36e" : "rgba(143, 220, 255, 0.85)"}
                        strokeWidth={selected ? 3 : 2}
                        markerEnd="url(#arrowhead)"
                      />
                      <rect x={midX - 40} y={midY - 14} width={80} height={28} rx={14} fill="rgba(5,10,20,0.92)" stroke="rgba(143,220,255,0.18)" />
                      <text x={midX} y={midY + 4} textAnchor="middle" fill="#d7f7ff" fontSize="12">
                        {edge.label}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {document.nodes.map((node) => {
                const active = node.id === selectedNodeId;
                return (
                  <button
                    key={node.id}
                    type="button"
                    className={active ? "canvas-node is-active" : "canvas-node"}
                    style={{ left: node.x, top: node.y, width: NODE_WIDTH, minHeight: NODE_HEIGHT }}
                    onPointerDown={(event) => handleNodePointerDown(event, node)}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedNodeId(node.id);
                      setSelectedEdgeId(null);
                      setRailTab("inspector");
                    }}
                  >
                    <div className="node-header">
                      <span className="node-kind" style={{ color: kindAccent(node.kind) }}>{node.kind}</span>
                      <span className="node-status" style={{ background: statusColor(node.status) }} />
                    </div>
                    <strong>{node.title}</strong>
                    <div className="node-subtitle">{node.subtitle}</div>
                    <p>{node.description}</p>
                    <div className="node-tags">
                      {node.tags.map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <aside className="rail">
          <div className="rail-tabs">
            {(["assistant", "inspector", "templates"] as RailTab[]).map((tab) => (
              <button key={tab} className={railTab === tab ? "rail-tab is-active" : "rail-tab"} onClick={() => setRailTab(tab)}>
                {tab === "assistant" ? "助手" : tab === "inspector" ? "检查器" : "模板"}
              </button>
            ))}
          </div>

          {railTab === "assistant" ? (
            <div className="rail-panel assistant-panel">
              <div className="assistant-header">
                <div>
                  <div className="assistant-kicker">Canvas assistant</div>
                  <strong>会话 {assistantSessionId.slice(0, 12)}</strong>
                </div>
                <span className={`assistant-status assistant-status-${assistantStatus}`}>
                  {assistantStatus === "idle" ? "空闲" : assistantStatus === "streaming" ? "处理中" : "等待确认"}
                </span>
              </div>

              <div className="assistant-tools">
                {assistantTools.map((tool) => (
                  <div key={tool.id} className="tool-card">
                    <div className="tool-name">{tool.toolName}</div>
                    <div className="tool-summary">{tool.summary}</div>
                  </div>
                ))}
              </div>

              <div className="assistant-messages">
                {assistantMessages.map((item) => (
                  <div key={item.id} className={item.role === "user" ? "message user" : "message assistant"}>
                    <div className="message-role">{item.role === "user" ? "你" : "助手"}</div>
                    <div className="message-content">{item.content}</div>
                  </div>
                ))}
              </div>

              {assistantInterrupt ? (
                <div className="interrupt-card">
                  <div className="interrupt-title">{assistantInterrupt.title}</div>
                  <p>{assistantInterrupt.message}</p>
                  <div className="interrupt-actions">
                    <button className="action-button danger" onClick={() => handleInterruptDecision("approve")}>{assistantInterrupt.actionLabel}</button>
                    <button className="action-button ghost" onClick={() => handleInterruptDecision("reject")}>取消</button>
                  </div>
                </div>
              ) : null}

              <div className="assistant-composer">
                <textarea
                  value={assistantInput}
                  onChange={(event) => setAssistantInput(event.target.value)}
                  placeholder="例如：创建第2集工作流、优化当前节点、删除选中节点、把优化建议写到画布上"
                  rows={5}
                />
                <button className="action-button primary" onClick={handleAssistantSend} disabled={assistantStatus !== "idle"}>
                  {assistantStatus === "idle" ? "发送给助手" : assistantStatus === "streaming" ? "处理中..." : "等待确认中"}
                </button>
              </div>
            </div>
          ) : null}

          {railTab === "inspector" ? (
            <div className="rail-panel">
              {selectedNode ? (
                <>
                  <div className="inspector-header">
                    <div>
                      <div className="assistant-kicker">节点检查器</div>
                      <strong>{selectedNode.title}</strong>
                    </div>
                    <div className="inspector-actions">
                      <button className="action-button ghost" onClick={duplicateSelectedNode}>复制</button>
                      <button className="action-button danger" onClick={deleteSelectedNode}>删除</button>
                    </div>
                  </div>

                  <label className="field">
                    <span>标题</span>
                    <input value={selectedNode.title} onChange={(event) => patchNode(selectedNode.id, { title: event.target.value }, "修改标题")} />
                  </label>
                  <label className="field">
                    <span>副标题</span>
                    <input value={selectedNode.subtitle} onChange={(event) => patchNode(selectedNode.id, { subtitle: event.target.value }, "修改副标题")} />
                  </label>
                  <label className="field">
                    <span>类型</span>
                    <select value={selectedNode.kind} onChange={(event) => patchNode(selectedNode.id, { kind: event.target.value as CanvasNode["kind"] }, "修改节点类型")}>
                      {["episode", "script", "character", "scene", "prompt", "image", "video", "audio", "edit", "publish", "note"].map((kind) => (
                        <option key={kind} value={kind}>{kind}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>状态</span>
                    <select value={selectedNode.status} onChange={(event) => patchNode(selectedNode.id, { status: event.target.value as CanvasNode["status"] }, "修改节点状态")}>
                      {["draft", "queued", "running", "review", "done", "blocked"].map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>描述</span>
                    <textarea rows={6} value={selectedNode.description} onChange={(event) => patchNode(selectedNode.id, { description: event.target.value }, "修改描述")} />
                  </label>
                  <label className="field">
                    <span>标签（逗号分隔）</span>
                    <input value={selectedNode.tags.join(", ")} onChange={(event) => patchNode(selectedNode.id, { tags: parseTags(event.target.value) }, "修改标签")} />
                  </label>
                  <label className="field">
                    <span>字段 JSON</span>
                    <textarea
                      rows={7}
                      value={JSON.stringify(selectedNode.fields, null, 2)}
                      onChange={(event) => {
                        try {
                          const value = JSON.parse(event.target.value) as Record<string, string>;
                          patchNode(selectedNode.id, { fields: value }, "修改字段");
                        } catch {
                          // ignore invalid json while typing
                        }
                      }}
                    />
                  </label>

                  <div className="subpanel">
                    <strong>生成历史 / 应用</strong>
                    <div className="history-actions">
                      <input value={historyNote} onChange={(event) => setHistoryNote(event.target.value)} placeholder="版本备注" />
                      <button className="action-button" onClick={saveManualVersion}>保存版本</button>
                      <button className="action-button primary" onClick={generateForSelectedNode}>生成一版结果</button>
                    </div>

                    {activeGeneration ? (
                      <div className="generation-preview">
                        <div className="generation-preview__meta">
                          <strong>当前激活结果</strong>
                          <span>{activeGeneration.provider}</span>
                        </div>
                        {activeGeneration.output.previewUrl ? (
                          <img src={activeGeneration.output.previewUrl} alt={activeGeneration.summary} />
                        ) : null}
                        {activeGeneration.output.text ? (
                          <pre>{activeGeneration.output.text}</pre>
                        ) : null}
                      </div>
                    ) : (
                      <div className="empty-inline">当前节点还没有生成记录。点击“生成一版结果”先创建一个。</div>
                    )}

                    <div className="generation-list">
                      {nodeGenerations.map((generation) => (
                        <div key={generation.id} className="generation-card">
                          <div className="history-meta">
                            <strong>{generation.kind.toUpperCase()}</strong>
                            <span>{generation.provider}</span>
                          </div>
                          <div className="history-time">{new Date(generation.createdAt).toLocaleString("zh-CN")}</div>
                          <div className="generation-summary">{generation.summary}</div>
                          <div className="generation-actions">
                            <button className="action-button ghost" onClick={() => applyGeneration(selectedNode.id, generation.id)}>
                              {generation.applied ? "已应用" : "应用结果"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="history-list">
                      {nodeHistory.map((version) => (
                        <div key={version.id} className="history-card">
                          <div className="history-meta">
                            <strong>{version.note}</strong>
                            <span>{version.source}</span>
                          </div>
                          <div className="history-time">{new Date(version.createdAt).toLocaleString("zh-CN")}</div>
                          <button className="action-button ghost" onClick={() => applyVersion(version)}>应用这个版本</button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="subpanel">
                    <strong>新增连线</strong>
                    <label className="field">
                      <span>起点</span>
                      <select value={newEdgeSource} onChange={(event) => setNewEdgeSource(event.target.value)}>
                        <option value="">选择起点</option>
                        {document.nodes.map((node) => (
                          <option key={node.id} value={node.id}>{node.title}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>终点</span>
                      <select value={newEdgeTarget} onChange={(event) => setNewEdgeTarget(event.target.value)}>
                        <option value="">选择终点</option>
                        {document.nodes.map((node) => (
                          <option key={node.id} value={node.id}>{node.title}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>标签</span>
                      <input value={newEdgeLabel} onChange={(event) => setNewEdgeLabel(event.target.value)} />
                    </label>
                    <button className="action-button" onClick={addEdge}>新增连线</button>
                  </div>
                </>
              ) : selectedEdge ? (
                <div className="edge-panel">
                  <div className="assistant-kicker">连线检查器</div>
                  <strong>{selectedEdge.label || "未命名连线"}</strong>
                  <p>{selectedEdge.source} → {selectedEdge.target}</p>
                  <button className="action-button danger" onClick={deleteSelectedEdge}>删除连线</button>
                </div>
              ) : (
                <div className="empty-panel">
                  <div className="assistant-kicker">检查器</div>
                  <strong>还没有选中内容</strong>
                  <p>点击画布中的节点或连线，就能在这里查看、修改、删除或应用历史版本。</p>
                </div>
              )}
            </div>
          ) : null}

          {railTab === "templates" ? (
            <div className="rail-panel">
              <div className="inspector-header">
                <div>
                  <div className="assistant-kicker">默认模板中心</div>
                  <strong>{currentPack.label}</strong>
                </div>
                <button className="action-button ghost" onClick={restorePromptPack}>恢复默认</button>
              </div>
              <p className="template-summary">{currentPack.summary}</p>
              <div className="template-stage-switch">
                {(["script", "character", "storyboard", "keyframe", "video", "audio"] as PromptStage[]).map((stage) => (
                  <button key={stage} className={templateStage === stage ? "stage-chip is-active" : "stage-chip"} onClick={() => setTemplateStage(stage)}>
                    {stage}
                  </button>
                ))}
              </div>
              <label className="field">
                <span>默认模板</span>
                <textarea
                  rows={14}
                  value={currentPack.stages[templateStage]}
                  onChange={(event) =>
                    setTemplates((current) => ({
                      ...current,
                      [workflowMode]: {
                        ...current[workflowMode],
                        stages: {
                          ...current[workflowMode].stages,
                          [templateStage]: event.target.value
                        }
                      }
                    }))
                  }
                />
              </label>
              <div className="template-actions">
                <button className="action-button primary" onClick={applyTemplateToNode} disabled={!selectedNode}>
                  应用到当前节点
                </button>
                <div className="template-hint">
                  这些模板借鉴了 `ai-moive-studio` 的结构，但现在是你自己的默认模板，可继续改。
                </div>
              </div>
            </div>
          ) : null}
        </aside>
      </main>

      <section className="queue-shell">
        <div className="queue-header">
          <div>
            <div className="assistant-kicker">运行队列</div>
            <strong>节点生成任务</strong>
          </div>
          <span className="status-chip">{runQueue.length} 条记录</span>
        </div>
        <div className="queue-list">
          {runQueue.length ? (
            runQueue.map((run) => (
              <div key={run.id} className="queue-card">
                <div className="queue-card__meta">
                  <strong>{run.nodeTitle}</strong>
                  <span className={`queue-badge queue-badge-${run.status}`}>{run.status}</span>
                </div>
                <div className="queue-card__sub">
                  {run.kind.toUpperCase()} · {run.provider}
                </div>
                <div className="queue-card__time">
                  提交：{new Date(run.createdAt).toLocaleTimeString("zh-CN")}
                  {run.finishedAt ? ` · 完成：${new Date(run.finishedAt).toLocaleTimeString("zh-CN")}` : ""}
                </div>
                <div className="generation-summary">{run.summary}</div>
              </div>
            ))
          ) : (
            <div className="empty-inline">还没有生成任务。你可以在节点检查器里点击“生成一版结果”。</div>
          )}
        </div>
      </section>
    </div>
  );
}
