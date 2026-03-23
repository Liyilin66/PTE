import { defineStore } from "pinia";

export const usePracticeStore = defineStore("practice", {
  state: () => ({
    day: 1,
    totalDays: 14,
    todayDone: 0,
    todayTarget: 3,
    tasks: [
      {
        id: "ra",
        title: "RA - 朗读段落",
        subtitle: "视觉节拍器",
        description: "跟随光标匀速朗读，克服卡壳习惯",
        todayCount: 0,
        icon: "ra",
        iconBg: "bg-[#1E4A86]",
        to: "/ra"
      },
      {
        id: "rs",
        title: "RS - 复述句子",
        subtitle: "关键词踩点器",
        description: "踩中50%关键词即通过",
        todayCount: 0,
        icon: "rs",
        iconBg: "bg-[#2E5EA8]",
        to: "/rs"
      },
      {
        id: "rl",
        title: "RL - 复述演讲",
        subtitle: "傻瓜提词器",
        description: "万能模板 + 关键词填空",
        todayCount: 0,
        icon: "rl",
        iconBg: "bg-gradient-to-br from-[#7A1DE6] to-[#BC1CFB]",
        to: "/rl"
      },
      {
        id: "we",
        title: "WE - 写作",
        subtitle: "模板拼装台",
        description: "结构化模板 + 实时字数统计",
        todayCount: 0,
        icon: "we",
        iconBg: "bg-[#00AA45]",
        to: "/we"
      },
      {
        id: "wfd",
        title: "WFD - 听写句子",
        subtitle: "生死线盲填",
        description: "Top 150高频句 + Diff对比",
        todayCount: 0,
        icon: "wfd",
        iconBg: "bg-[#F3054E]",
        to: "/wfd"
      }
    ],
    raPassage:
      "The rapid advancement of artificial intelligence has transformed numerous industries including healthcare education and transportation with machine learning algorithms now capable of diagnosing diseases recommending personalized learning paths and optimizing traffic patterns in real time.",
    rsPrompt: "点击播放按钮听音频，然后复述你听到的句子",
    rlTemplate:
      "The lecture mainly discusses [TOPIC]. The speaker first mentions [POINT 1], then explains [POINT 2], and finally concludes that [CONCLUSION]."
  }),
  getters: {
    progressPercent(state) {
      if (!state.todayTarget) return 0;
      return Math.round((state.todayDone / state.todayTarget) * 100);
    }
  }
});
