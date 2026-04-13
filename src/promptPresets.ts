export type WorkflowMode = "explainer" | "story" | "liveAction" | "pictureNarration";

export type PromptStage =
  | "script"
  | "character"
  | "storyboard"
  | "keyframe"
  | "video"
  | "audio";

export interface PromptPack {
  mode: WorkflowMode;
  label: string;
  summary: string;
  stages: Record<PromptStage, string>;
}

export const DEFAULT_STAGE_BY_KIND: Record<string, PromptStage> = {
  script: "script",
  character: "character",
  scene: "storyboard",
  prompt: "storyboard",
  image: "keyframe",
  video: "video",
  audio: "audio",
  edit: "video",
  publish: "script",
  note: "script",
  episode: "script"
};

export const PROMPT_PACKS: Record<WorkflowMode, PromptPack> = {
  explainer: {
    mode: "explainer",
    label: "解说漫",
    summary: "快节奏、强信息密度、前 3 秒先给异常，再补背景。",
    stages: {
      script:
        "根据 {{idea}} 写一条适合抖音的解说漫短视频脚本。要求：1. 第一屏直接抛异常或冲突；2. 全长 {{duration}}；3. 每 2 到 4 秒出现一个新信息点；4. 结尾保留追更点；5. 语言口语化，方便旁白直接朗读。",
      character:
        "根据剧本提取主要角色，输出统一的角色设定：姓名、年龄、身份、气质、外观锚点、服装锚点、表演要求。重点是跨镜头一致性，不要生成网红脸，不要过度美颜。",
      storyboard:
        "把当前脚本拆成 5 到 12 个短 beat。每个 beat 只做一件事，并输出：镜头目标、景别、角色出场、道具、字幕重点、是否需要真动态。",
      keyframe:
        "为这个镜头写一条竖版关键帧提示词。要求：1. 画面主体明确；2. 重要信息避开字幕带；3. 角色脸和道具要能复用；4. 风格统一，适合后续图生视频。",
      video:
        "为这个镜头写一条视频提示词。要求：1. 只描述必要运动；2. 节奏偏短视频；3. 保持角色和场景一致；4. 如果镜头是信息型镜头，动作要克制，不要乱运镜。",
      audio:
        "为这段旁白生成配音控制说明。输出音色、语速、情绪、停顿点、重读词。目标是悬疑感和信息清晰度兼顾。"
    }
  },
  story: {
    mode: "story",
    label: "剧本漫",
    summary: "角色驱动、多场景叙事、情绪与角色连续性优先。",
    stages: {
      script:
        "根据 {{idea}} 写一段剧本漫脚本。要求：角色关系明确、对白推动剧情、每场都有冲突、结尾有反转或悬念。输出应便于继续提取角色、场景和分镜。",
      character:
        "提取所有主角与关键配角，输出结构化角色卡：身份、动机、冲突点、视觉锚点、三视图提示词。角色名称和特征必须稳定。",
      storyboard:
        "按剧情场景拆解分镜。每个镜头要给出起始状态、结束状态、角色站位、镜头作用、对白承载方式，并标记是否需要视频生成。",
      keyframe:
        "为该分镜生成关键帧提示词，强调角色站位、景别、情绪、光线和画面焦点，保证可作为后续视频首帧。",
      video:
        "为该镜头生成视频提示词，保留起始到结束动作的连续性，动作要自然，镜头语言服务剧情，不做无意义运镜。",
      audio:
        "为该剧本片段生成角色配音说明，区分旁白与对白，给出音色建议、情绪、语速、停顿和口型重点。"
    }
  },
  liveAction: {
    mode: "liveAction",
    label: "真人短剧",
    summary: "更偏写实、镜头和表演克制，角色稳定性要求最高。",
    stages: {
      script:
        "根据 {{idea}} 写一条真人短剧脚本。要求：真实口语、强情绪冲突、镜头可落地、避免幻想化对白。优先强钩子和强转折。",
      character:
        "输出真人角色卡，强调普通人质感而非偶像感：发型、肤质、年龄感、服装、体态、表演边界。保证角色跨镜头稳定。",
      storyboard:
        "为真人短剧拆分镜头，给出镜头类型、构图、角色调度、动作幅度、音效线索。重点是节奏、真实感和剪辑可用性。",
      keyframe:
        "写关键帧提示词，要求：写实人物、手机端可读、重点动作清晰、肤质和服装稳定。不要时尚写真感。",
      video:
        "写真人镜头的视频提示词，强调微表情、自然动作、动作幅度适中、镜头切换服务剧情。避免漂移和无意义动态。",
      audio:
        "输出真人短剧旁白或对白配音控制：音色自然、不要广播腔，给出语速和情绪范围，并标出需要压重的词。"
    }
  },
  pictureNarration: {
    mode: "pictureNarration",
    label: "图文说",
    summary: "配图 + 旁白 + 字幕，轻视频优先，适合批量生产。",
    stages: {
      script:
        "根据 {{idea}} 生成图文说脚本。要求：章节清晰、段落短、适合配图和字幕，每段都能独立成图。",
      character:
        "如果有角色，输出简版角色卡；如果没有角色，输出主题对象和视觉符号，保证图文素材统一。",
      storyboard:
        "按段落输出配图说明、字幕重点和旁白重点。每段只承担一个信息点，保证用户滑读和听读都清楚。",
      keyframe:
        "写适合图文说的配图提示词，强调构图清晰、信息明确、适合做轻推拉和字幕覆盖。",
      video:
        "如果需要轻视频，写轻动效提示词，动作克制，避免复杂调度，优先服务字幕和旁白信息传达。",
      audio:
        "给出图文说旁白配音说明，要求清晰、自然、稳定，适合连续批量内容。"
    }
  }
};
