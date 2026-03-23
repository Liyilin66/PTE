import { createRouter, createWebHistory } from "vue-router";
import HomeView from "@/views/HomeView.vue";
import RAView from "@/views/RAView.vue";
import RAResultView from "@/views/RAResultView.vue";
import RSView from "@/views/RSView.vue";
import RSResultView from "@/views/RSResultView.vue";
import RLView from "@/views/RLView.vue";
import WEView from "@/views/WEView.vue";
import WFDView from "@/views/WFDView.vue";

const routes = [
  { path: "/", redirect: "/home" },
  { path: "/home", name: "home", component: HomeView },
  { path: "/ra", name: "ra", component: RAView },
  { path: "/ra/result", name: "ra-result", component: RAResultView },
  { path: "/rs", name: "rs", component: RSView },
  { path: "/rs/result", name: "rs-result", component: RSResultView },
  { path: "/rl", name: "rl", component: RLView },
  { path: "/we", name: "we", component: WEView },
  { path: "/wfd", name: "wfd", component: WFDView }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

export default router;
