/* =============================================================
   app.js — 占卜逻辑与渲染
   ============================================================= */
"use strict";

/* ---------- 工具：确定性随机（同样的信息 → 同样的卦象） ---------- */
function hashStr(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- 构建完整 78 张塔罗牌 ---------- */
function buildDeck() {
  const deck = MAJOR_ARCANA.map((c) => ({
    type: "major",
    name: c.name,
    en: c.en,
    sym: c.sym,
    arcana: "大阿尔卡那 · " + c.n,
    up: c.up,
    rev: c.rev,
  }));
  SUITS.forEach((s) => {
    RANKS.forEach((rk) => {
      const isCourt = rk.r > 10;
      const name = isCourt ? `${s.name}${rk.cn}` : `${s.name}${rk.cn}`;
      deck.push({
        type: "minor",
        name,
        en: `${rk.label} of ${s.key}`,
        sym: s.sym,
        arcana: `小阿尔卡那 · ${s.name}（${s.element}）`,
        up: { kw: `${s.element} · ${rk.up}`, txt: `${s.name}牌关乎${s.theme}。此刻牌面指向「${rk.up}」——在${s.focus}的领域，能量正以这样的方式流动。` },
        rev: { kw: `${s.element}（逆位） · ${rk.rev}`, txt: `逆位的${s.name}提醒你留意${s.theme}方面的阻滞：${rk.rev}。在${s.focus}上，先向内调整再行动。` },
      });
    });
  });
  return deck;
}
const FULL_DECK = buildDeck();

/* ---------- 数字归约（保留大师数 11/22/33） ---------- */
function reduceNumber(n, keepMaster = true) {
  function sumDigits(x) {
    return String(x).split("").reduce((a, d) => a + (parseInt(d, 10) || 0), 0);
  }
  let v = n;
  while (v > 9) {
    if (keepMaster && (v === 11 || v === 22 || v === 33)) return v;
    v = sumDigits(v);
  }
  return v;
}

/* ---------- 生命数字 ---------- */
function calcNumerology(y, m, d, name) {
  const lifeRaw = reduceNumber(
    reduceNumber(y, false) + reduceNumber(m, false) + reduceNumber(d, false)
  );
  const lifePath = LIFE_PATH[lifeRaw] ? lifeRaw : reduceNumber(lifeRaw, false);
  const birthdayNum = reduceNumber(d, false);

  // 表达数（仅当姓名含拉丁字母时计算）
  let expression = null;
  if (name && /[a-zA-Z]/.test(name)) {
    const map = {};
    "abcdefghijklmnopqrstuvwxyz".split("").forEach((ch, i) => (map[ch] = (i % 9) + 1));
    let sum = 0;
    for (const ch of name.toLowerCase()) if (map[ch]) sum += map[ch];
    if (sum > 0) expression = reduceNumber(sum);
  }
  return { lifePath, lifeData: LIFE_PATH[lifePath], birthdayNum, birthdayTxt: BIRTHDAY_NUM[birthdayNum], expression };
}

/* ---------- 占星：太阳星座 + 生肖 ---------- */
function getSunSign(m, d) {
  for (const s of SUN_SIGNS) {
    const [fm, fd] = s.from, [tm, td] = s.to;
    if (fm === tm) { if (m === fm && d >= fd && d <= td) return s; }
    else if ((m === fm && d >= fd) || (m === tm && d <= td)) return s;
  }
  return SUN_SIGNS[9]; // 摩羯（跨年兜底）
}

/* ---------- 八字四柱 ---------- */
function julianDay(y, m, d) {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4)
    - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
}

// 月支对应（按节气近似：寅=2月…），返回 0-11，对应正月寅起的序号
function solarMonthBranchOrder(m, d) {
  // 各月节气近似日（交节日，之前归上一月）
  const termDay = [0, 6, 4, 6, 5, 6, 6, 7, 8, 8, 8, 7, 7]; // index=月份(1-12)
  let order = m - 2; // 2月→寅(order0)
  if (d < termDay[m]) order -= 1; // 未到交节，归上一个节气月
  order = ((order % 12) + 12) % 12;
  return order; // 0=寅,1=卯,...
}

function calcBazi(y, m, d, hourBranch /* 0-11 或 null */) {
  // 立春近似：2月4日前算上一年
  let baziYear = y;
  if (m < 2 || (m === 2 && d < 4)) baziYear = y - 1;

  const yStem = ((baziYear - 4) % 10 + 10) % 10;
  const yBranch = ((baziYear - 4) % 12 + 12) % 12;

  const monthOrder = solarMonthBranchOrder(m, d);          // 0=寅
  const mBranch = (2 + monthOrder) % 12;                    // 寅=2
  const mStem = ((yStem % 5) * 2 + 2 + monthOrder) % 10;    // 五虎遁

  const dayIdx = (((julianDay(y, m, d) - 2451551) % 60) + 60) % 60; // 0=甲子
  const dStem = dayIdx % 10;
  const dBranch = dayIdx % 12;

  let hour = null;
  if (hourBranch !== null && hourBranch !== undefined) {
    const hStem = ((dStem % 5) * 2 + hourBranch) % 10; // 五鼠遁
    hour = { stem: hStem, branch: hourBranch };
  }

  const pillars = [
    { label: "年柱", stem: yStem, branch: yBranch },
    { label: "月柱", stem: mStem, branch: mBranch },
    { label: "日柱", stem: dStem, branch: dBranch },
  ];
  if (hour) pillars.push({ label: "时柱", stem: hour.stem, branch: hour.branch });

  // 五行统计（含天干 + 地支主气）
  const elemCount = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  pillars.forEach((p) => {
    elemCount[STEM_ELEM[p.stem]]++;
    elemCount[BRANCH_ELEM[p.branch]]++;
  });

  return {
    pillars,
    baziYear,
    dayMaster: dStem,                 // 日主天干
    dayElem: STEM_ELEM[dStem],
    dayYin: STEM_YIN[dStem],
    elemCount,
    zodiac: ZODIAC[yBranch],          // 以年支定生肖（与立春一致）
  };
}

/* ---------- 塔罗抽牌 ---------- */
function drawTarot(rng, count) {
  const idx = FULL_DECK.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const picks = [];
  for (let k = 0; k < count; k++) {
    const card = FULL_DECK[idx[k]];
    const reversed = rng() < 0.42;
    picks.push({ card, reversed });
  }
  return picks;
}

/* =============================================================
   渲染
   ============================================================= */
const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const TAROT_POSITIONS = [
  { tag: "过去 · 根源", desc: "塑造当下的来路与底色" },
  { tag: "当下 · 处境", desc: "此刻能量的核心主题" },
  { tag: "未来 · 走向", desc: "顺势发展可能抵达之处" },
];

function renderTarot(panel, draws, focusLabel) {
  panel.innerHTML = "";
  panel.appendChild(el("p", "spread-intro",
    `三牌阵 · 围绕「${esc(focusLabel)}」展开。点击卡牌可重新翻面查看。过去照见来路，当下指明主题，未来昭示走向。`));

  const grid = el("div", "tarot-grid");
  draws.forEach((dw, i) => {
    const pos = TAROT_POSITIONS[i];
    const orient = dw.reversed ? "逆位" : "正位";
    const card = el("div", "tcard flipped" + (dw.reversed ? " reversed" : ""));
    card.innerHTML = `
      <div class="tcard-inner">
        <div class="tcard-face tcard-back"><span>✦</span></div>
        <div class="tcard-face tcard-front">
          <div class="tcard-pos">${esc(pos.tag)}</div>
          <div class="tcard-symbol">${dw.card.sym}</div>
          <div>
            <div class="tcard-name">${esc(dw.card.name)}</div>
            <div class="tcard-arcana">${esc(dw.card.arcana)}</div>
            <span class="tcard-orient ${dw.reversed ? "orient-rev" : "orient-up"}">${orient}</span>
          </div>
        </div>
      </div>`;
    card.addEventListener("click", () => card.classList.toggle("flipped"));
    grid.appendChild(card);
  });
  panel.appendChild(grid);

  const readings = el("div", "card-readings");
  draws.forEach((dw, i) => {
    const pos = TAROT_POSITIONS[i];
    const m = dw.reversed ? dw.card.rev : dw.card.up;
    const orient = dw.reversed ? "逆位" : "正位";
    readings.appendChild(el("div", "reading",
      `<h4><span class="pos-tag">${esc(pos.tag)}</span>${esc(dw.card.name)} · ${orient}</h4>
       <p class="kw">${esc(m.kw)}</p>
       <p>${esc(m.txt)}</p>`));
  });
  panel.appendChild(readings);

  // 牌阵综述
  const present = draws[1];
  const pm = present.reversed ? present.card.rev : present.card.up;
  panel.appendChild(el("div", "lead",
    `综观此阵，<b>${esc(present.card.name)}（${present.reversed ? "逆位" : "正位"}）</b>立于当下，是这段时间的主旋律——${esc(pm.kw)}。
     带着过去「${esc(draws[0].card.name)}」的沉淀，若顺势而为，未来正朝「${esc(draws[2].card.name)}」的方向流动。`));
}

function renderNumerology(panel, num) {
  panel.innerHTML = "";
  const ld = num.lifeData;
  panel.appendChild(el("div", "lead",
    `你的<b>生命灵数</b>是 <span class="big-number" style="font-size:1.6rem;vertical-align:-2px;">${num.lifePath}</span> —— ${esc(ld.title)}。这串数字凝结着你此生的主旋律与核心课题。`));

  const stats = el("div", "stat-grid");
  stats.appendChild(el("div", "stat", `<div class="label">生命灵数 Life Path</div><div class="value">${num.lifePath}</div>`));
  stats.appendChild(el("div", "stat", `<div class="label">生日数 Birthday</div><div class="value">${num.birthdayNum} <small>${esc(num.birthdayTxt || "")}</small></div>`));
  if (num.expression !== null) {
    stats.appendChild(el("div", "stat", `<div class="label">表达数 Expression（姓名）</div><div class="value">${num.expression}</div>`));
  }
  panel.appendChild(stats);

  const block = el("div", "block",
    `<h3>${esc(ld.title)}</h3><p>${esc(ld.txt)}</p>`);
  const tags = el("div", "tag-list");
  ld.kw.forEach((k) => tags.appendChild(el("span", "tag", esc(k))));
  block.appendChild(tags);
  panel.appendChild(block);

  if (num.expression !== null && LIFE_PATH[num.expression]) {
    const ed = LIFE_PATH[num.expression];
    panel.appendChild(el("div", "block",
      `<h3>表达数 ${num.expression} · 才华底色</h3>
       <p>由姓名拼写推算，你天赋的表达方式偏向：${esc(ed.kw.join("、"))}。这是你向世界呈现自己、施展才华时最自然的色彩。</p>`));
  }
}

function renderAstrology(panel, sign, num) {
  panel.innerHTML = "";
  panel.appendChild(el("div", "lead",
    `你的太阳星座是 <b>${sign.sym} ${esc(sign.name)}</b>（${sign.en}）—— ${esc(sign.element)}象 · ${esc(sign.mode)}宫 · 守护星 ${esc(sign.ruler)}。太阳星座代表你意识层面的自我与核心生命力。`));

  const stats = el("div", "stat-grid");
  stats.appendChild(el("div", "stat", `<div class="label">元素 Element</div><div class="value">${esc(sign.element)}象</div>`));
  stats.appendChild(el("div", "stat", `<div class="label">模式 Modality</div><div class="value">${esc(sign.mode)}宫</div>`));
  stats.appendChild(el("div", "stat", `<div class="label">守护星 Ruler</div><div class="value" style="font-size:1.05rem;">${esc(sign.ruler)}</div>`));
  panel.appendChild(stats);

  const block = el("div", "block", `<h3>${sign.sym} ${esc(sign.name)} · 性格底色</h3><p>${esc(sign.traits)}</p>`);
  const tags = el("div", "tag-list");
  sign.kw.forEach((k) => tags.appendChild(el("span", "tag", esc(k))));
  block.appendChild(tags);
  panel.appendChild(block);

  const elemTxt = {
    "火": "火象的你以热情、行动与直觉驱动，渴望点燃与创造，天生有感染力。",
    "土": "土象的你以务实、稳定与感官扎根现实，重视安全感与可靠的成果。",
    "风": "风象的你以思考、沟通与社交流动，重视理念、信息与人际的连接。",
    "水": "水象的你以情感、直觉与共情感知世界，内心丰沛而善于体察。",
  };
  panel.appendChild(el("div", "block", `<h3>${esc(sign.element)}象能量</h3><p>${esc(elemTxt[sign.element])}</p>`));
}

function renderBazi(panel, bazi, hasHour) {
  panel.innerHTML = "";
  const dmYin = bazi.dayYin ? "阴" : "阳";
  panel.appendChild(el("div", "lead",
    `你的<b>日主</b>为 <b>${STEMS[bazi.dayMaster]}（${dmYin}${bazi.dayElem}）</b>，这是八字的核心——代表「你自己」。${esc(STEM_PERSONA[STEMS[bazi.dayMaster]])}`));

  const pillars = el("div", "pillars");
  bazi.pillars.forEach((p) => {
    pillars.appendChild(el("div", "pillar",
      `<div class="p-label">${p.label}</div>
       <div class="p-stem">${STEMS[p.stem]}</div>
       <div class="p-branch">${BRANCHES[p.branch]}</div>
       <div class="p-elem">${STEM_ELEM[p.stem]} · ${BRANCH_ELEM[p.branch]}</div>`));
  });
  panel.appendChild(pillars);

  if (!hasHour) {
    panel.appendChild(el("p", "spread-intro", "（未填出生时辰，故略去时柱；填入可得更完整的四柱。）"));
  }

  // 日主五行解读
  panel.appendChild(el("div", "block", `<h3>日主五行 · ${bazi.dayElem}</h3><p>${esc(ELEM_READING[bazi.dayElem])}</p>`));

  // 五行分布
  const total = Object.values(bazi.elemCount).reduce((a, b) => a + b, 0) || 1;
  const bars = el("div", "elem-bars");
  ["木", "火", "土", "金", "水"].forEach((e) => {
    const c = bazi.elemCount[e];
    const pct = Math.round((c / total) * 100);
    bars.appendChild(el("div", "elem-bar",
      `<span class="e-name">${e}</span>
       <span class="e-track"><span class="e-fill e-${e}" style="width:${pct}%"></span></span>
       <span class="e-count">${c}</span>`));
  });
  const balBlock = el("div", "block", `<h3>五行分布</h3>`);
  balBlock.appendChild(bars);
  panel.appendChild(balBlock);

  // 旺缺建议
  const entries = Object.entries(bazi.elemCount);
  const maxE = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  const missing = entries.filter(([, c]) => c === 0).map(([e]) => e);
  let advice = `命局中 <b>${maxE[0]}</b> 之气最旺，是你最突出的特质来源。`;
  if (missing.length) {
    advice += `相对而言 <b>${missing.join("、")}</b> 较弱或缺失，可在生活中有意识地补足——例如多接触相应的颜色、方位与活动，以求五行流通、性情更圆融。`;
  } else {
    advice += `五行大致俱全，能量较为流通，性情多面而平衡。`;
  }
  panel.appendChild(el("div", "block", `<h3>旺衰提点</h3><p>${advice}</p>`));
}

function renderSynthesis(panel, ctx) {
  panel.innerHTML = "";
  const { num, sign, bazi, draws, name, focusLabel } = ctx;
  const present = draws[1];
  const pm = present.reversed ? present.card.rev : present.card.up;
  const who = name ? `${name}` : "你";

  panel.appendChild(el("div", "lead",
    `把四种体系叠在一起看，${esc(who)}的人格呈现出多层次的轮廓——
     <b>生命数字</b>道出此生的主驱动，<b>星盘</b>勾勒情绪与气质，<b>八字日主</b>揭示天生的本性，而<b>塔罗</b>照见当下的课题。四面棱镜，照见同一个你。`));

  const axes = el("div", "synth-axes");
  const axisData = [
    { icon: "🔢", title: "核心驱动", from: `生命灵数 ${num.lifePath}`,
      txt: `${esc(num.lifeData.title.split(" · ")[1] || num.lifeData.title)}是你内在的发动机：${esc(num.lifeData.kw.join("、"))}。这股力量在你做重大选择时最为明显。` },
    { icon: "🌌", title: "情绪气质", from: `${sign.name} · ${sign.element}象`,
      txt: `作为${esc(sign.element)}象的${esc(sign.name)}，你待人接物的温度与节奏偏向「${esc(sign.kw.slice(0,3).join("、"))}」，这决定了别人最先感受到的你。` },
    { icon: "🀄", title: "内在本性", from: `日主 ${STEMS[bazi.dayMaster]}（${bazi.dayElem}）`,
      txt: `${esc(STEM_PERSONA[STEMS[bazi.dayMaster]].split("。")[0])}——这是你卸下面具后、最本真的底色与脾性。` },
    { icon: "🃏", title: "当下课题", from: `塔罗 · ${present.card.name}`,
      txt: `此刻的你正经历「${esc(pm.kw)}」的能量。${esc(pm.txt)}` },
  ];
  axisData.forEach((a) => {
    axes.appendChild(el("div", "axis",
      `<div class="a-head"><span class="a-icon">${a.icon}</span>
        <span class="a-title">${esc(a.title)}</span>
        <span class="a-from">${esc(a.from)}</span></div>
       <p>${a.txt}</p>`));
  });
  panel.appendChild(axes);

  // 交叉洞察：数字 × 星座元素 × 日主
  const cross = crossInsight(num, sign, bazi);
  panel.appendChild(el("div", "block", `<h3>✺ 交叉洞察</h3><p>${esc(cross)}</p>`));

  // 行动建议（结合关注领域）
  const advice = adviceFor(ctx.focus, num, sign, bazi, present);
  const box = el("div", "advice", `<h3>给${esc(who)}的行动指引 · 聚焦「${esc(focusLabel)}」</h3>`);
  const ul = el("ul");
  advice.forEach((a) => ul.appendChild(el("li", null, esc(a))));
  box.appendChild(ul);
  panel.appendChild(box);
}

function crossInsight(num, sign, bazi) {
  const elemVibe = { "火": "外放而炽热", "土": "沉稳而务实", "风": "灵动而思辨", "水": "细腻而深情" };
  const dmElem = bazi.dayElem;
  const harmony = (sign.element === "火" && dmElem === "木") || (sign.element === "水" && dmElem === "木") ||
                  (sign.element === "土" && dmElem === "金") || (sign.element === "火" && dmElem === "土");
  let s = `星盘给你${elemVibe[sign.element]}的外在气质，而八字日主属${dmElem}，是更深一层的本性。`;
  if (sign.element === dmElem || ELEM_GENERATE[dmElem] === ({火:"火",土:"土",风:"金",水:"水"}[sign.element])) {
    s += `两者气场相合，意味着你的「表现」与「本心」较为一致，活得较为表里如一。`;
  } else {
    s += `两者略有张力——你呈现给世界的样子，和内心真实的需求未必完全同步，这份反差恰是你丰富与深度的来源。`;
  }
  s += ` 叠加生命灵数 ${num.lifePath} 的${num.lifeData.kw[0]}特质，使你在面对选择时，往往${num.lifePath % 2 === 1 ? "更倾向主动开创、亲自掌舵" : "更擅长协调权衡、借力而行"}。`;
  return s;
}

function adviceFor(focus, num, sign, bazi, present) {
  const base = {
    general: [
      `善用你生命灵数 ${num.lifePath} 的天赋（${num.lifeData.kw.slice(0,2).join("、")}），别在不擅长的赛道上硬耗。`,
      `${sign.name}的你，记得${sign.kw.includes("固执")||sign.kw.includes("犹豫")?"在坚持与灵活之间找平衡":"把热情用在真正重要的少数事上"}。`,
      `日主属${bazi.dayElem}，留意它的阴影面，适时${{"木":"修剪固执","火":"收敛急躁","土":"打破固守","金":"柔化刚硬","水":"安定心绪"}[bazi.dayElem]}。`,
    ],
    love: [
      `感情中，你的${sign.name}特质让你${sign.element==="水"?"重感受、易共情，但要避免把对方理想化":sign.element==="火"?"主动热烈，但需给对方回应的空间":sign.element==="土"?"踏实长情，但别用控制代替沟通":"擅长沟通，但别让理性盖过真心的流露"}。`,
      `生命灵数 ${num.lifePath} 提示：${num.lifePath===2||num.lifePath===6?"你天生重关系，但要先把爱留一份给自己":num.lifePath===1||num.lifePath===8?"独立强势的你，要学会示弱与并肩":"在亲密里保留自我，也向对方敞开内心"}。`,
      present.reversed ? `塔罗逆位提醒：当下感情或有需厘清的迷雾，先诚实面对自己的感受再表达。` : `塔罗正位显示：当下感情能量流动顺畅，适合真诚地推进一步。`,
    ],
    career: [
      `事业上，发挥${bazi.dayElem}日主的${{"木":"规划与成长力","火":"表现与领导力","土":"稳健与执行力","金":"果决与原则性","水":"灵活与谋略"}[bazi.dayElem]}。`,
      `生命灵数 ${num.lifePath}（${num.lifeData.kw[0]}）适合的路径：${num.lifePath===8?"管理、经营、与资源打交道":num.lifePath===1?"开创、主导、做第一个吃螃蟹的人":num.lifePath===3?"创意、表达、与人沟通的领域":num.lifePath===4||num.lifePath===22?"系统建造、长期工程":"发挥专长、稳步积累影响力"}。`,
      present.reversed ? `塔罗逆位：近期或有阻力或需调整方向，先稳住节奏再发力。` : `塔罗正位：能量在助推你，把握时机大胆推进。`,
    ],
    wealth: [
      `财富上，${bazi.dayElem}日主者宜${{"木":"靠成长性、长期布局获利","火":"靠人气、表现与机会","土":"靠踏实积累与不动产","金":"靠果断决策与专业","水":"靠灵活变通与信息差"}[bazi.dayElem]}。`,
      `生命灵数 ${num.lifePath}：${num.lifePath===8?"你对金钱有天然的掌控欲与能力，注意取之有道":num.lifePath===4?"稳健储蓄与规划是你的强项，避免过度保守":"先把钱用在能放大你天赋的地方"}。`,
      bazi.elemCount["金"] === 0 ? `命中金（财气相关之一）偏弱，理财宜更有纪律、量入为出。` : `财气流通尚可，关键在持续与节制。`,
    ],
    growth: [
      `成长的核心功课，藏在生命灵数 ${num.lifePath} 的阴影里：${num.lifeData.txt.split("功课")[1] ? "功课" + num.lifeData.txt.split("功课")[1] : "在天赋之外，补上你回避的那一课。"}`,
      `${sign.name}需要练习的，往往是${sign.kw[sign.kw.length-1]}的另一面。`,
      `让${bazi.dayElem}日主的能量流动起来：${{"木":"学会放下与柔软","火":"学会沉静与持久","土":"学会变通与冒险","金":"学会包容与圆融","水":"学会专注与扎根"}[bazi.dayElem]}。`,
    ],
  };
  return base[focus] || base.general;
}

/* =============================================================
   流程控制
   ============================================================= */
let lastCtx = null;
let shuffleSalt = 0;

function runDivination() {
  const name = $("#name").value.trim();
  const bd = $("#birthdate").value;
  if (!bd) { $("#birthdate").focus(); return; }
  const [y, m, d] = bd.split("-").map((x) => parseInt(x, 10));
  const btVal = $("#birthtime").value;
  const hourBranch = btVal === "" ? null : parseInt(btVal, 10);
  const gender = $("#gender").value;
  const focus = $("#focus").value;
  const question = $("#question").value.trim();

  const focusLabelMap = { general: "综合人格", love: "感情", career: "事业", wealth: "财富", growth: "成长" };
  const focusLabel = focusLabelMap[focus];

  // 计算
  const num = calcNumerology(y, m, d, name);
  const sign = getSunSign(m, d);
  const bazi = calcBazi(y, m, d, hourBranch);

  // 确定性随机种子
  const seedStr = `${name}|${bd}|${btVal}|${gender}|${focus}|${question}|${shuffleSalt}`;
  const rng = mulberry32(hashStr(seedStr));
  const draws = drawTarot(rng, 3);

  const ctx = { name, y, m, d, hourBranch, gender, focus, focusLabel, question, num, sign, bazi, draws };
  lastCtx = ctx;

  // 渲染头部
  const who = name || "旅人";
  $("#result-greeting").textContent = `${who}，星图已为你展开`;
  const parts = [`${y} 年 ${m} 月 ${d} 日`];
  if (hourBranch !== null) parts.push(SHICHEN[hourBranch].name);
  parts.push(`${sign.sym}${sign.name}`);
  parts.push(`生肖${bazi.zodiac.a}`);
  parts.push(`灵数 ${num.lifePath}`);
  $("#result-meta").textContent = parts.join(" · ") + (question ? `　|　所问：${question}` : "");

  // 渲染各面板
  renderTarot($('.tab-panel[data-panel="tarot"]'), draws, focusLabel);
  renderNumerology($('.tab-panel[data-panel="numerology"]'), num);
  renderAstrology($('.tab-panel[data-panel="astrology"]'), sign, num);
  renderBazi($('.tab-panel[data-panel="bazi"]'), bazi, hourBranch !== null);
  renderSynthesis($('.tab-panel[data-panel="synthesis"]'), ctx);

  // 显示结果并切到塔罗页
  $("#result").classList.remove("hidden");
  switchTab("tarot");
  $("#result").scrollIntoView({ behavior: "smooth", block: "start" });

  // 卡牌依次翻开动画
  const cards = document.querySelectorAll('.tab-panel[data-panel="tarot"] .tcard');
  cards.forEach((c) => c.classList.remove("flipped"));
  cards.forEach((c, i) => setTimeout(() => c.classList.add("flipped"), 250 + i * 320));
}

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.dataset.panel === name));
}

/* ---------- 初始化 ---------- */
function initBirthtimeSelect() {
  const sel = $("#birthtime");
  SHICHEN.forEach((s) => {
    const o = document.createElement("option");
    o.value = String(s.idx);
    o.textContent = `${s.name}（${s.range}）`;
    sel.appendChild(o);
  });
}

function initStarfield() {
  const sf = $("#starfield");
  const n = Math.min(140, Math.floor((window.innerWidth * window.innerHeight) / 9000));
  for (let i = 0; i < n; i++) {
    const s = document.createElement("div");
    s.className = "star";
    const size = Math.random() * 2 + 0.6;
    s.style.width = s.style.height = size + "px";
    s.style.left = Math.random() * 100 + "%";
    s.style.top = Math.random() * 100 + "%";
    s.style.setProperty("--dur", (Math.random() * 4 + 2).toFixed(1) + "s");
    s.style.animationDelay = (Math.random() * 4).toFixed(1) + "s";
    sf.appendChild(s);
  }
}

// 包一层：任何计算/渲染错误都显示在页面上，而不是静默失败
function safeRun() {
  try {
    runDivination();
  } catch (err) {
    console.error("起卦出错：", err);
    const r = $("#result");
    if (r) {
      r.classList.remove("hidden");
      const g = $("#result-greeting");
      if (g) g.textContent = "起卦时出错了";
      const m = $("#result-meta");
      if (m) m.textContent = "错误信息：" + String((err && err.message) || err) + "（请把这行字告诉开发者）";
      r.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      alert("起卦出错：" + String((err && err.message) || err));
    }
  }
}

function boot() {
  // 外围初始化各自 try/catch，绝不阻塞核心按钮的绑定
  try { initBirthtimeSelect(); } catch (e) { console.error("时辰下拉初始化失败：", e); }
  try { initStarfield(); } catch (e) { console.error("星空初始化失败：", e); }

  const form = document.querySelector("#divine-form");
  if (form) {
    form.addEventListener("submit", (e) => { e.preventDefault(); shuffleSalt = 0; safeRun(); });
  }
  // 双保险：直接给按钮绑 click（按钮非 submit 时也能触发）
  const btn = document.querySelector(".cast-btn");
  if (btn && btn.type !== "submit") {
    btn.addEventListener("click", (e) => { e.preventDefault(); shuffleSalt = 0; safeRun(); });
  }

  document.querySelectorAll(".tab").forEach((t) =>
    t.addEventListener("click", () => switchTab(t.dataset.tab)));

  const rsh = document.querySelector("#reshuffle");
  if (rsh) rsh.addEventListener("click", () => { if (!lastCtx) return; shuffleSalt++; safeRun(); });

  const rst = document.querySelector("#restart");
  if (rst) rst.addEventListener("click", () => {
    const r = document.querySelector("#result");
    if (r) r.classList.add("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
    const nm = document.querySelector("#name");
    if (nm) nm.focus();
  });
}

// 脚本可能在 DOMContentLoaded 之后才执行（内联/缓存场景），两种情况都覆盖
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
