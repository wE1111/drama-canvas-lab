export type CanvasNodeKind =
  | "episode"
  | "script"
  | "character"
  | "scene"
  | "prompt"
  | "image"
  | "video"
  | "audio"
  | "edit"
  | "publish"
  | "note";

export type CanvasNodeStatus = "draft" | "queued" | "running" | "review" | "done" | "blocked";

export interface CanvasNode {
  id: string;
  kind: CanvasNodeKind;
  title: string;
  subtitle: string;
  description: string;
  status: CanvasNodeStatus;
  x: number;
  y: number;
  tags: string[];
  fields: Record<string, string>;
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

export interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface CanvasDocument {
  id?: string;
  title: string;
  summary: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: CanvasViewport;
}

export const starterDocument: CanvasDocument = {
  id: "doc-midnight-ep01",
  title: "《午夜便利店》 第1集工作流",
  summary: "抖音首发版，30秒竖屏，真人悬疑解说漫。",
  viewport: {
    x: 120,
    y: 96,
    zoom: 1
  },
  nodes: [
    {
      id: "episode",
      kind: "episode",
      title: "第1集目标",
      subtitle: "发布目标",
      description: "30 秒、前 3 秒必须给异常钩子，卖“找您一元”与门打不开。",
      status: "review",
      x: 120,
      y: 120,
      tags: ["Douyin", "30s", "Hook"],
      fields: {
        platform: "抖音",
        runtime: "30s",
        ratio: "9:16"
      }
    },
    {
      id: "script",
      kind: "script",
      title: "脚本与旁白",
      subtitle: "文本节点",
      description: "先给异常，再补背景。首句固定：找您一元。",
      status: "done",
      x: 520,
      y: 80,
      tags: ["Narration"],
      fields: {
        opening: "找您一元。可我根本还没买东西。",
        ending: "黑暗里，有脚步声朝我走过来。"
      }
    },
    {
      id: "characters",
      kind: "character",
      title: "角色定妆",
      subtitle: "陈默 / 店员",
      description: "陈默固定偏分、右眉浅疤、灰色连帽外套。店员只给半正脸与递硬币手部。",
      status: "running",
      x: 520,
      y: 300,
      tags: ["Consistency"],
      fields: {
        chenMo: "偏分，眼下疲惫，右眉浅疤",
        clerk: "深蓝马甲，白衬衫，半正脸"
      }
    },
    {
      id: "scenes",
      kind: "scene",
      title: "场景与道具",
      subtitle: "便利店 / 硬币 / 规则",
      description: "便利店外立面、规则告示、硬币特写、收银台屏幕四组资产先稳定下来。",
      status: "running",
      x: 520,
      y: 520,
      tags: ["Asset"],
      fields: {
        sceneA: "深夜街角唯一亮灯便利店",
        sceneB: "收银台冷白屏幕"
      }
    },
    {
      id: "prompts",
      kind: "prompt",
      title: "提示词包",
      subtitle: "Nano Banana + Vidu",
      description: "Nano Banana 负责关键帧稳定，Vidu 负责真动态镜头。",
      status: "draft",
      x: 920,
      y: 80,
      tags: ["Prompting"],
      fields: {
        image: "角色与道具关键帧",
        video: "只做 01/05/06/07 四个重镜头"
      }
    },
    {
      id: "images",
      kind: "image",
      title: "关键帧层",
      subtitle: "图像资产",
      description: "当前需要 8 张竖版关键帧，保证店员、硬币、规则和屏幕统一。",
      status: "running",
      x: 920,
      y: 300,
      tags: ["Image"],
      fields: {
        provider: "Nano Banana / Vidu",
        count: "8"
      }
    },
    {
      id: "video",
      kind: "video",
      title: "重镜头生成",
      subtitle: "Vidu 视频",
      description: "只生成值钱的 4 段真动态：找零、店员出现、硬币异动、门打不开。",
      status: "queued",
      x: 920,
      y: 520,
      tags: ["Video"],
      fields: {
        heavyShots: "01,05,06,07",
        model: "Vidu Q3"
      }
    },
    {
      id: "audio",
      kind: "audio",
      title: "旁白与音效",
      subtitle: "语音层",
      description: "旁白声音要更冷更克制，重点词要压出来，门铃和灯闪单独做点题音效。",
      status: "review",
      x: 1320,
      y: 80,
      tags: ["Voice"],
      fields: {
        voice: "男声、克制、悬疑",
        fx: "门铃 / 灯闪 / 打字声"
      }
    },
    {
      id: "edit",
      kind: "edit",
      title: "剪辑合成",
      subtitle: "成片装配",
      description: "轻镜头负责信息推进，重镜头负责抓人。字幕要更大，节奏要更狠。",
      status: "blocked",
      x: 1320,
      y: 320,
      tags: ["Edit"],
      fields: {
        subtitle: "大字、描边、上浮",
        pacing: "每 2-4 秒一个新信息"
      }
    },
    {
      id: "publish",
      kind: "publish",
      title: "发布版检查",
      subtitle: "封面 / 标题 / 发布",
      description: "出封面帧和标题，确保首发版不是剧情说明片，而是高钩子短视频。",
      status: "draft",
      x: 1320,
      y: 560,
      tags: ["Publish"],
      fields: {
        cover: "店员递硬币 + 文案",
        title: "午夜便利店规则，第一条就救不了命"
      }
    }
  ],
  edges: [
    { id: "e1", source: "episode", target: "script", label: "明确目标" },
    { id: "e2", source: "episode", target: "characters", label: "锁人设" },
    { id: "e3", source: "episode", target: "scenes", label: "锁场景" },
    { id: "e4", source: "script", target: "prompts", label: "转成镜头" },
    { id: "e5", source: "characters", target: "images", label: "定角色图" },
    { id: "e6", source: "scenes", target: "images", label: "定道具图" },
    { id: "e7", source: "prompts", target: "images", label: "生关键帧" },
    { id: "e8", source: "images", target: "video", label: "转真动态" },
    { id: "e9", source: "script", target: "audio", label: "做旁白" },
    { id: "e10", source: "video", target: "edit", label: "重镜头" },
    { id: "e11", source: "audio", target: "edit", label: "配音音效" },
    { id: "e12", source: "edit", target: "publish", label: "交付" }
  ]
};

export const secondaryDocument: CanvasDocument = {
  id: "doc-rule-apartment-ep01",
  title: "《规则公寓》 第1集工作流",
  summary: "偏剧本漫路线，主打连续剧情和场景压迫感。",
  viewport: {
    x: 120,
    y: 96,
    zoom: 1
  },
  nodes: [
    {
      id: "apartment-episode",
      kind: "episode",
      title: "第1集目标",
      subtitle: "剧情导向",
      description: "建立规则公寓世界观，先给住户守则，再抛一个违规则死的钩子。",
      status: "review",
      x: 120,
      y: 120,
      tags: ["Story", "Rule Horror"],
      fields: {
        platform: "抖音",
        runtime: "45s",
        ratio: "9:16"
      }
    },
    {
      id: "apartment-script",
      kind: "script",
      title: "剧本节点",
      subtitle: "连续剧情",
      description: "住户搬进公寓后发现墙上写着 7 条规则，其中第 4 条已经被人用血划掉。",
      status: "running",
      x: 500,
      y: 120,
      tags: ["Script"],
      fields: {
        opening: "不要在凌晨两点照镜子。",
        ending: "门外脚步停在他门口。"
      }
    },
    {
      id: "apartment-characters",
      kind: "character",
      title: "角色节点",
      subtitle: "房客 / 管理员",
      description: "男主年轻租客，管理员表面和善但总是避开规则第 4 条。",
      status: "draft",
      x: 500,
      y: 360,
      tags: ["Character"],
      fields: {
        lead: "普通都市男性，克制型",
        manager: "中年管理员，笑容过满"
      }
    },
    {
      id: "apartment-storyboard",
      kind: "prompt",
      title: "分镜节点",
      subtitle: "长镜头压迫感",
      description: "走廊长镜头、规章特写、门缝视角、镜子反射镜头。",
      status: "draft",
      x: 880,
      y: 220,
      tags: ["Storyboard"],
      fields: {
        mood: "压迫、安静、逐步失真"
      }
    },
    {
      id: "apartment-video",
      kind: "video",
      title: "视频节点",
      subtitle: "重镜头优先",
      description: "重点生成：规章特写、走廊长镜头、门缝黑影、镜子反射。",
      status: "blocked",
      x: 1260,
      y: 220,
      tags: ["Video"],
      fields: {
        heavyShots: "守则 / 走廊 / 门缝 / 镜子"
      }
    }
  ],
  edges: [
    { id: "ae1", source: "apartment-episode", target: "apartment-script", label: "剧情目标" },
    { id: "ae2", source: "apartment-script", target: "apartment-characters", label: "人物" },
    { id: "ae3", source: "apartment-script", target: "apartment-storyboard", label: "拆镜头" },
    { id: "ae4", source: "apartment-storyboard", target: "apartment-video", label: "生成视频" }
  ]
};

export function createStarterDocuments() {
  return [starterDocument, secondaryDocument].map((doc) => JSON.parse(JSON.stringify(doc)) as CanvasDocument);
}
