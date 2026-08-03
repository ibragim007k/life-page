/*
  Панель редактирования сайта. Работает без сервера: читает и
  сохраняет data.js и img/hero.jpg напрямую через GitHub API,
  используя ключ доступа, введённый один раз на этом устройстве.
*/

const STORAGE_KEY = "site_admin_config";
const DATA_PATH = "data.js";
const PHOTO_PATH = "img/hero.jpg";
const DEFAULT_OWNER = "ibragim007k";
const DEFAULT_REPO = "life-page";

const els = {};
document.querySelectorAll("[id]").forEach((el) => {
  els[el.id.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = el;
});

let cfg = null;
let state = { data: null, dataSha: null, photoSha: null, photoFile: null };

/* ---------------- Хранилище настроек ---------------- */

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveConfig(c) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
}

function clearConfig() {
  localStorage.removeItem(STORAGE_KEY);
}

/* ---------------- Base64 <-> UTF-8 ---------------- */

function b64DecodeUnicode(b64) {
  const binary = atob(b64.replace(/\n/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}

function b64EncodeUnicode(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const binary = new Uint8Array(reader.result);
      let str = "";
      binary.forEach((b) => (str += String.fromCharCode(b)));
      resolve(btoa(str));
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/* ---------------- Даты ---------------- */

function isoToRu(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function ruToIso(ru) {
  if (!ru) return "";
  const [d, m, y] = ru.split(".");
  if (!d || !m || !y) return "";
  return `${y}-${m}-${d}`;
}

/* ---------------- GitHub API ---------------- */

async function ghFetch(path, options = {}) {
  const res = await fetch(
    `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/${path}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(options.headers || {}),
      },
    }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `GitHub API: ${res.status}`);
  }
  return res.json();
}

async function ghGetFile(path) {
  return ghFetch(`contents/${path}?ref=${encodeURIComponent(cfg.branch)}`);
}

async function ghPutFile(path, base64Content, sha, message) {
  const body = { message, content: base64Content, branch: cfg.branch };
  if (sha) body.sha = sha;
  return ghFetch(`contents/${path}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

/* ---------------- Разбор и сборка data.js ---------------- */

function parseDataJs(source) {
  const fn = new Function(`${source}\nreturn SITE_DATA;`);
  return fn();
}

function renderDataJs(d) {
  const j = (v) => JSON.stringify(v);

  const paragraphs = d.why.paragraphs.map((p) => `      ${j(p)},`).join("\n");

  const debts = d.debts.items
    .map(
      (it) => `      {
        name: ${j(it.name)},
        amount: ${Number(it.amount) || 0},
        remaining: ${Number(it.remaining) || 0},
        dueDate: ${j(it.dueDate)},
        status: ${j(it.status)},
      },`
    )
    .join("\n");

  const achievements = d.achievements
    .map(
      (r) => `    {
      title: ${j(r.title)},
      description: ${j(r.description)},
      amount: ${Number(r.amount) || 0},
      date: ${j(r.date)},
      photo: ${j(r.photo || "")},
    },`
    )
    .join("\n");

  const goals = d.goals
    .map(
      (g) => `    {
      title: ${j(g.title)},
      description: ${j(g.description)},
      category: ${j(g.category)},
      targetDate: ${j(g.targetDate)},
    },`
    )
    .join("\n");

  const qa = d.community.qa
    .map(
      (q) => `      {
        question: ${j(q.question)},
        answer: ${j(q.answer)},
        date: ${j(q.date)},
      },`
    )
    .join("\n");

  const stories = d.community.stories
    .map(
      (s) => `      {
        name: ${j(s.name)},
        text: ${j(s.text)},
        date: ${j(s.date)},
      },`
    )
    .join("\n");

  const updates = d.updates
    .map(
      (u) => `    {
      date: ${j(u.date)},
      text: ${j(u.text)},
    },`
    )
    .join("\n");

  const links = d.footer.links
    .map((l) => `      { label: ${j(l.label)}, url: ${j(l.url)} },`)
    .join("\n");

  return `/*
  ============================================================
  ЕДИНСТВЕННЫЙ ФАЙЛ, КОТОРЫЙ НУЖНО РЕДАКТИРОВАТЬ.
  Меняешь долги, цели и обновления здесь — сайт (index.html)
  сам всё отрисует. Можно редактировать вручную или через
  панель admin.html с любого устройства.
  ============================================================
*/

const SITE_DATA = {

  // ---------- Шапка / Hero-секция ----------
  hero: {
    name: ${j(d.hero.name)},
    tagline: ${j(d.hero.tagline)},
    backgroundImage: ${j(d.hero.backgroundImage)},
  },

  // ---------- Секция "Почему я это делаю" ----------
  why: {
    title: ${j(d.why.title)},
    paragraphs: [
${paragraphs}
    ],
  },

  // ---------- Долги ----------
  debts: {
    totalGoal: ${Number(d.debts.totalGoal) || 0},
    items: [
${debts}
    ],
  },

  // ---------- Достижения ----------
  achievements: [
${achievements}
  ],

  // ---------- Цели ----------
  goals: [
${goals}
  ],

  // ---------- Сообщество ----------
  community: {
    formUrl: ${j(d.community.formUrl)},

    qa: [
${qa}
    ],

    stories: [
${stories}
    ],
  },

  // ---------- Лента обновлений ----------
  updates: [
${updates}
  ],

  // ---------- Футер ----------
  footer: {
    links: [
${links}
    ],
  },
};
`;
}

/* ---------------- Строки-шаблоны (долги / цели / обновления / ссылки) ---------------- */

function addRow(containerId, tplId, values) {
  const tpl = document.getElementById(tplId);
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.querySelectorAll("[data-key]").forEach((input) => {
    const key = input.dataset.key;
    if (key in values) input.value = values[key];
  });
  node.querySelector("[data-remove]").addEventListener("click", () => node.remove());
  document.getElementById(containerId).appendChild(node);
  return node;
}

function readRows(containerId, keys) {
  const rows = document.querySelectorAll(`#${containerId} .row`);
  return Array.from(rows).map((row) => {
    const obj = {};
    keys.forEach((key) => {
      const input = row.querySelector(`[data-key="${key}"]`);
      obj[key] = input ? input.value : "";
    });
    return obj;
  });
}

function clearRows(containerId) {
  document.getElementById(containerId).innerHTML = "";
}

/* ---------------- Строка достижения (с загрузкой фото) ---------------- */

function addAchievementRow(values) {
  const tpl = document.getElementById("tpl-achievement-row");
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.querySelectorAll("[data-key]").forEach((input) => {
    const key = input.dataset.key;
    if (key in values) input.value = values[key];
  });

  const preview = node.querySelector("[data-photo-preview]");
  const status = node.querySelector("[data-photo-status]");
  const fileInput = node.querySelector("[data-photo-input]");
  const hiddenPhoto = node.querySelector('[data-key="photo"]');

  if (values.photo) {
    preview.src = values.photo + "?t=" + Date.now();
    preview.hidden = false;
  }

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    status.textContent = "Загружаю…";
    try {
      const base64 = await fileToBase64(file);
      const path = `img/achievements/achievement-${Date.now()}.jpg`;
      await ghPutFile(path, base64, null, "Фото для достижения");
      hiddenPhoto.value = path;
      preview.src = URL.createObjectURL(file);
      preview.hidden = false;
      status.textContent = "Фото загружено.";
    } catch (err) {
      status.textContent = "Ошибка: " + err.message;
    }
  });

  node.querySelector("[data-remove]").addEventListener("click", () => node.remove());
  document.getElementById("rows-achievements").appendChild(node);
  return node;
}

/* ---------------- Заполнение формы данными ---------------- */

function populateForm(d) {
  els.inName.value = d.hero.name;
  els.inTagline.value = d.hero.tagline;

  els.inWhyTitle.value = d.why.title;
  els.inWhyText.value = d.why.paragraphs.join("\n");

  els.inTotalGoal.value = d.debts.totalGoal;

  clearRows("rows-debts");
  d.debts.items.forEach((it) => addRow("rows-debts", "tpl-debt-row", it));

  clearRows("rows-achievements");
  d.achievements.forEach((r) => addAchievementRow(r));

  clearRows("rows-goals");
  d.goals.forEach((g) => addRow("rows-goals", "tpl-goal-row", g));

  els.inFormUrl.value = d.community.formUrl;

  clearRows("rows-qa");
  d.community.qa.forEach((q) =>
    addRow("rows-qa", "tpl-qa-row", {
      question: q.question,
      answer: q.answer,
      dateInput: ruToIso(q.date),
    })
  );

  clearRows("rows-stories");
  d.community.stories.forEach((s) =>
    addRow("rows-stories", "tpl-story-row", {
      name: s.name,
      dateInput: ruToIso(s.date),
      text: s.text,
    })
  );

  clearRows("rows-updates");
  d.updates.forEach((u) =>
    addRow("rows-updates", "tpl-update-row", { dateInput: ruToIso(u.date), text: u.text })
  );

  clearRows("rows-links");
  d.footer.links.forEach((l) => addRow("rows-links", "tpl-link-row", l));

  els.photoPreview.src = d.hero.backgroundImage + "?t=" + Date.now();
}

function collectForm(previousData) {
  return {
    hero: {
      name: els.inName.value.trim(),
      tagline: els.inTagline.value.trim(),
      backgroundImage: previousData.hero.backgroundImage,
    },
    why: {
      title: els.inWhyTitle.value.trim(),
      paragraphs: els.inWhyText.value.split("\n").map((s) => s.trim()).filter(Boolean),
    },
    debts: {
      totalGoal: Number(els.inTotalGoal.value) || 0,
      items: readRows("rows-debts", ["name", "status", "amount", "remaining", "dueDate"]),
    },
    achievements: readRows("rows-achievements", ["title", "description", "amount", "date", "photo"]).map(
      (r) => ({
        title: r.title,
        description: r.description,
        amount: Number(r.amount) || 0,
        date: r.date,
        photo: r.photo,
      })
    ),
    goals: readRows("rows-goals", ["title", "category", "description", "targetDate"]),
    community: {
      formUrl: els.inFormUrl.value.trim(),
      qa: readRows("rows-qa", ["question", "answer", "dateInput"]).map((q) => ({
        question: q.question,
        answer: q.answer,
        date: isoToRu(q.dateInput),
      })),
      stories: readRows("rows-stories", ["name", "dateInput", "text"]).map((s) => ({
        name: s.name,
        date: isoToRu(s.dateInput),
        text: s.text,
      })),
    },
    updates: readRows("rows-updates", ["dateInput", "text"]).map((u) => ({
      date: isoToRu(u.dateInput),
      text: u.text,
    })),
    footer: {
      links: readRows("rows-links", ["label", "url"]),
    },
  };
}

/* ---------------- Загрузка данных из репозитория ---------------- */

async function loadAll() {
  const fileRes = await ghGetFile(DATA_PATH);
  state.dataSha = fileRes.sha;
  state.data = parseDataJs(b64DecodeUnicode(fileRes.content));

  try {
    const photoRes = await ghGetFile(PHOTO_PATH);
    state.photoSha = photoRes.sha;
  } catch {
    state.photoSha = null;
  }

  populateForm(state.data);
}

/* ---------------- Экраны ---------------- */

function showEditor() {
  els.screenLogin.hidden = true;
  els.screenEditor.hidden = false;
}

function showLogin(message) {
  els.screenEditor.hidden = true;
  els.screenLogin.hidden = false;
  els.loginError.textContent = message || "";
}

/* ---------------- Обработчики ---------------- */

els.btnLogin.addEventListener("click", async () => {
  const token = els.inToken.value.trim();
  if (!token) {
    els.loginError.textContent = "Введи ключ доступа.";
    return;
  }
  cfg = {
    token,
    owner: els.inOwner.value.trim() || DEFAULT_OWNER,
    repo: els.inRepo.value.trim() || DEFAULT_REPO,
    branch: els.inBranch.value.trim() || "main",
  };
  els.btnLogin.disabled = true;
  els.btnLogin.textContent = "Проверяю…";
  els.loginError.textContent = "";
  try {
    await loadAll();
    saveConfig(cfg);
    showEditor();
  } catch (err) {
    els.loginError.textContent = "Не получилось: " + err.message;
  } finally {
    els.btnLogin.disabled = false;
    els.btnLogin.textContent = "Открыть панель";
  }
});

els.btnLogout.addEventListener("click", () => {
  clearConfig();
  cfg = null;
  els.inToken.value = "";
  showLogin();
});

els.btnAddDebt.addEventListener("click", () =>
  addRow("rows-debts", "tpl-debt-row", {
    name: "",
    status: "in_progress",
    amount: 0,
    remaining: 0,
    dueDate: "",
  })
);

els.btnAddAchievement.addEventListener("click", () =>
  addAchievementRow({ title: "", description: "", amount: 0, date: "", photo: "" })
);

els.btnAddGoal.addEventListener("click", () =>
  addRow("rows-goals", "tpl-goal-row", {
    title: "",
    category: "личная",
    description: "",
    targetDate: "",
  })
);

els.btnAddQa.addEventListener("click", () =>
  addRow("rows-qa", "tpl-qa-row", {
    question: "",
    answer: "",
    dateInput: new Date().toISOString().slice(0, 10),
  })
);

els.btnAddStory.addEventListener("click", () =>
  addRow("rows-stories", "tpl-story-row", {
    name: "",
    dateInput: new Date().toISOString().slice(0, 10),
    text: "",
  })
);

els.btnAddUpdate.addEventListener("click", () => {
  const container = document.getElementById("rows-updates");
  const node = addRow("rows-updates", "tpl-update-row", {
    dateInput: new Date().toISOString().slice(0, 10),
    text: "",
  });
  container.prepend(node);
});

els.btnAddLink.addEventListener("click", () =>
  addRow("rows-links", "tpl-link-row", { label: "", url: "" })
);

els.inPhotoFile.addEventListener("change", () => {
  const file = els.inPhotoFile.files[0];
  if (!file) return;
  state.photoFile = file;
  els.btnSavePhoto.disabled = false;
  els.photoPreview.src = URL.createObjectURL(file);
});

els.btnSavePhoto.addEventListener("click", async () => {
  if (!state.photoFile) return;
  els.btnSavePhoto.disabled = true;
  els.photoStatus.textContent = "Загружаю…";
  try {
    const base64 = await fileToBase64(state.photoFile);
    const res = await ghPutFile(PHOTO_PATH, base64, state.photoSha, "Обновить фото на главной");
    state.photoSha = res.content.sha;
    els.photoStatus.textContent = "Сохранено — сайт обновится в течение минуты.";
    state.photoFile = null;
  } catch (err) {
    els.photoStatus.textContent = "Ошибка: " + err.message;
    els.btnSavePhoto.disabled = false;
  }
});

els.btnSaveAll.addEventListener("click", async () => {
  els.btnSaveAll.disabled = true;
  els.saveStatus.textContent = "Сохраняю…";
  els.saveStatus.className = "savebar__status";
  try {
    const updated = collectForm(state.data);
    const source = renderDataJs(updated);
    const base64 = b64EncodeUnicode(source);
    const res = await ghPutFile(DATA_PATH, base64, state.dataSha, "Обновление данных сайта");
    state.dataSha = res.content.sha;
    state.data = updated;
    els.saveStatus.textContent = "Сохранено — сайт обновится в течение минуты.";
    els.saveStatus.className = "savebar__status savebar__status--ok";
  } catch (err) {
    els.saveStatus.textContent = "Ошибка: " + err.message;
    els.saveStatus.className = "savebar__status savebar__status--error";
  } finally {
    els.btnSaveAll.disabled = false;
  }
});

/* ---------------- Старт ---------------- */

(function init() {
  els.inOwner.value = DEFAULT_OWNER;
  els.inRepo.value = DEFAULT_REPO;

  const saved = loadConfig();
  if (saved) {
    cfg = saved;
    els.inToken.value = saved.token;
    els.inOwner.value = saved.owner;
    els.inRepo.value = saved.repo;
    els.inBranch.value = saved.branch;
    loadAll()
      .then(showEditor)
      .catch((err) => showLogin("Не получилось загрузить данные: " + err.message));
  } else {
    showLogin();
  }
})();
