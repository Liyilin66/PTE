<script setup>
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import ToastMessage from "@/components/ToastMessage.vue";
import { useAuthStore } from "@/stores/auth";

const authStore = useAuthStore();
const router = useRouter();

onMounted(async () => {
  if (authStore.isLoggedIn) {
    await authStore.loadStatus();
    if (!authStore.isLoggedIn && router.currentRoute.value.path !== "/auth") {
      router.replace("/auth");
    }
  } else {
    authStore.loaded = true;
  }
});
</script>

<template>
  <RouterView />
  <ToastMessage />
</template>
