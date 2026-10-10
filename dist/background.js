const n = {
  COURSES: "swayam404_courses_v1",
  QUESTIONS: "swayam404_questions_v1",
  SELECTED_COURSE_ID: "swayam404_selected_course_v1",
  SETTINGS: "swayam404_settings_v1"
}, u = [
  {
    id: "course-econ-101",
    name: "Economics (Common Course)",
    externalCourseId: "SWAYAM-ECON-CORE",
    description: "Shared core course for micro/macroeconomics assignments",
    isDefault: !0,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  },
  {
    id: "course-ent-201",
    name: "Entrepreneurship (Minor Course)",
    externalCourseId: "SWAYAM-ENTR-MINOR",
    description: "Specialized minor course in startup mechanics & venture creation",
    isDefault: !1,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  }
], g = {
  theme: "dark",
  selectedCourseId: "course-econ-101",
  autoScanOnLoad: !1,
  aiAssistedReviewEnabled: !1
};
function S() {
  var a;
  return typeof chrome < "u" && !!((a = chrome == null ? void 0 : chrome.storage) != null && a.local);
}
const w = {};
async function d(a, t) {
  if (S())
    return new Promise((e) => {
      chrome.storage.local.get([a], (s) => {
        if (chrome.runtime.lastError) {
          console.warn(`Storage get error for ${a}:`, chrome.runtime.lastError), e(t);
          return;
        }
        s && s[a] !== void 0 ? e(s[a]) : e(t);
      });
    });
  if (typeof window < "u" && window.localStorage)
    try {
      const e = window.localStorage.getItem(a);
      if (e !== null)
        return JSON.parse(e);
    } catch (e) {
      console.warn(`localStorage read error for ${a}:`, e);
    }
  return w[a] ?? t;
}
async function r(a, t) {
  if (S())
    return new Promise((e, s) => {
      chrome.storage.local.set({ [a]: t }, () => {
        chrome.runtime.lastError ? s(chrome.runtime.lastError) : e();
      });
    });
  if (typeof window < "u" && window.localStorage)
    try {
      window.localStorage.setItem(a, JSON.stringify(t));
    } catch (e) {
      console.warn(`localStorage write error for ${a}:`, e);
    }
  w[a] = t;
}
class m {
  /**
   * Initializes default course seeds if none exist
   */
  static async initDefaults() {
    (await d(n.COURSES, [])).length === 0 && await r(n.COURSES, u), await d(n.SELECTED_COURSE_ID, "") || await r(n.SELECTED_COURSE_ID, u[0].id);
  }
  static async getCourses() {
    const t = await d(n.COURSES, []);
    return t.length === 0 ? (await this.initDefaults(), u) : t;
  }
  static async saveCourse(t) {
    const e = await this.getCourses(), s = e.findIndex((c) => c.id === t.id), o = [...e], i = (/* @__PURE__ */ new Date()).toISOString();
    s >= 0 ? o[s] = { ...t, updatedAt: i } : o.push({ ...t, createdAt: i, updatedAt: i }), await r(n.COURSES, o);
  }
  static async deleteCourse(t) {
    const s = (await this.getCourses()).filter((l) => l.id !== t);
    await r(n.COURSES, s);
    const i = (await this.getQuestions()).filter((l) => l.courseId !== t);
    await r(n.QUESTIONS, i), await this.getSelectedCourseId() === t && s.length > 0 && await this.setSelectedCourseId(s[0].id);
  }
  static async getSelectedCourseId() {
    var e;
    const t = await d(n.SELECTED_COURSE_ID, "");
    return t || (((e = (await this.getCourses())[0]) == null ? void 0 : e.id) ?? "course-econ-101");
  }
  static async setSelectedCourseId(t) {
    await r(n.SELECTED_COURSE_ID, t);
  }
  static async getQuestions(t) {
    const e = await d(n.QUESTIONS, []);
    return t ? e.filter((s) => s.courseId === t) : e;
  }
  static async saveQuestion(t) {
    const e = await this.getQuestions(), s = (/* @__PURE__ */ new Date()).toISOString(), o = e.findIndex((c) => c.id === t.id), i = [...e];
    o >= 0 ? i[o] = { ...t, updatedAt: s } : i.push({ ...t, createdAt: s, updatedAt: s }), await r(n.QUESTIONS, i);
  }
  static async saveQuestions(t) {
    const e = await this.getQuestions(), s = new Map(e.map((i) => [i.id, i])), o = (/* @__PURE__ */ new Date()).toISOString();
    for (const i of t)
      s.set(i.id, {
        ...i,
        updatedAt: o,
        createdAt: i.createdAt || o
      });
    await r(n.QUESTIONS, Array.from(s.values()));
  }
  static async deleteQuestion(t) {
    const e = await this.getQuestions();
    await r(n.QUESTIONS, e.filter((s) => s.id !== t));
  }
  static async replaceQuestionsForCourse(t, e) {
    const o = (await this.getQuestions()).filter((c) => c.courseId !== t), i = e.map((c) => ({
      ...c,
      courseId: t,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    }));
    await r(n.QUESTIONS, [...o, ...i]);
  }
  static async getSettings() {
    return d(n.SETTINGS, g);
  }
  static async saveSettings(t) {
    const e = await this.getSettings();
    await r(n.SETTINGS, { ...e, ...t });
  }
  static async exportAll() {
    const t = await this.getCourses(), e = await this.getQuestions();
    return {
      version: "1.0.0",
      app: "swayam404",
      exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
      courses: t,
      questions: e
    };
  }
  static async exportCourse(t) {
    const s = (await this.getCourses()).find((i) => i.id === t), o = await this.getQuestions(t);
    return {
      version: "1.0.0",
      app: "swayam404",
      exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
      courses: s ? [s] : [],
      questions: o
    };
  }
  static async clearAll() {
    await r(n.COURSES, []), await r(n.QUESTIONS, []);
  }
}
console.log("[swayam404] Background service worker initialized.");
chrome.runtime.onInstalled.addListener(async (a) => {
  console.log("[swayam404] Extension installed/updated, reason:", a.reason);
  try {
    await m.initDefaults(), console.log("[swayam404] Default courses and settings initialized in storage.");
  } catch (t) {
    console.error("[swayam404] Error initializing defaults on install:", t);
  }
});
chrome.sidePanel && "setPanelBehavior" in chrome.sidePanel && chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: !1 }).catch((a) => {
  console.warn("[swayam404] sidePanel.setPanelBehavior warning:", a);
});
