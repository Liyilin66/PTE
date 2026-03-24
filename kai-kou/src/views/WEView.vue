<script setup>
import { computed, ref } from "vue";
import NavBar from "@/components/NavBar.vue";
import OrangeButton from "@/components/OrangeButton.vue";
import { useUIStore } from "@/stores/ui";

const uiStore = useUIStore();

const subject = ref("");
const body = ref("");

const wordCount = computed(() => {
  return body.value.trim() ? body.value.trim().split(/\s+/).length : 0;
});

function submitEssay() {
  if (!subject.value.trim() || !body.value.trim()) {
    uiStore.showToast("Please complete subject and body before submission.", "warning");
    return;
  }

  uiStore.showToast("Your answer is received. Scoring will be available soon.", "success");
}

function clearAll() {
  subject.value = "";
  body.value = "";
}
</script>

<template>
  <div class="min-h-screen bg-bg">
    <NavBar title="Write Essay" back-to="/home" />

    <main class="mx-auto max-w-3xl px-4 py-6">
      <section class="rounded-xl border bg-white p-6 shadow-card">
        <div class="mb-4">
          <label class="mb-2 block text-sm font-medium text-text">Subject</label>
          <input
            v-model="subject"
            type="text"
            class="h-11 w-full rounded-lg border border-[#D1D5DB] px-3 text-sm outline-none focus:border-[#9BB7E3]"
            placeholder="Enter your email subject"
          />
        </div>

        <div>
          <div class="mb-2 flex items-center justify-between">
            <label class="block text-sm font-medium text-text">Body</label>
            <span class="text-sm text-orange">Words: {{ wordCount }}</span>
          </div>
          <textarea
            v-model="body"
            class="min-h-[320px] w-full resize-y rounded-lg border border-[#D1D5DB] p-3 text-sm outline-none focus:border-[#9BB7E3]"
            placeholder="Write your response here..."
          />
        </div>

        <div class="mt-5 flex justify-end gap-3">
          <OrangeButton tone="outline" @click="clearAll">Clear</OrangeButton>
          <OrangeButton @click="submitEssay">Submit</OrangeButton>
        </div>
      </section>
    </main>
  </div>
</template>