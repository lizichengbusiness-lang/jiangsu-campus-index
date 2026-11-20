(() => {
  "use strict";

  const { schools, sources } = window.directoryData;
  const byId = new Map(schools.map(school => [school.id, school]));
  const cities = [...new Set(schools.map(school => school.city))];
  const number = new Intl.NumberFormat("zh-CN");
  const names = new Intl.Collator("zh-Hans-CN-u-co-pinyin");
  const storageKey = "jiangsu-campus-saved-v1";
  const pageSize = 12;
  const $ = id => document.getElementById(id);
  const filters = ["search", "city", "level", "nature", "admission", "price", "sort"];
  const admissionsLabels = {
    art: "艺术类",
    sport: "体育类（统考）",
    team: "高水平运动队",
    single: "体育单招"
  };
  const esc = input => String(input ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
  const formatRange = (min, max) => min === max
    ? number.format(min)
    : `${number.format(min)}–${number.format(max)}`;
  const sourceLink = (href, label) => `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
  const tuitionSearchUrl = school => "https://www.baidu.com/s?wd=" +
    encodeURIComponent(`"${school.name}" 2026 招生章程 学费 收费标准`);
  const normalized = text => String(text).normalize("NFKC").toLowerCase();
  const statusText = school => school.level === "专科" ? `${school.nature === "中外合作办学" ? "中外合作" : school.nature}大专`
    : school.nature === "民办" ? "民办本科" : school.nature === "公办" ? "公办本科" : "中外合作本科";
  let saved = readSaved();
  let view = "all";
  let preset = "all";
  let page = 1;
  let results = schools;
  let toastTimer;

  function readSaved() {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "[]");
      return new Set(Array.isArray(stored) ? stored.filter(id => byId.has(id)) : []);
    } catch {
      return new Set();
    }
  }

  function notify(message) {
    $("toast").textContent = message;
    $("toast").hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $("toast").hidden = true; }, 2100);
  }

  function mainFees(school) {
    return school.tuition?.fees.filter(fee => !fee.special) ?? [];
  }

  function feeBounds(school) {
    const fees = mainFees(school);
    if (!fees.length) return null;
    return {
      min: Math.min(...fees.map(fee => fee.min)),
      max: Math.max(...fees.map(fee => fee.max))
    };
  }

  function matchPrice(school, price) {
    if (!price) return true;
    if (price === "unknown") return !school.tuition;
    if (price === "known") return Boolean(school.tuition);
    const ranges = { low: [0, 9999], mid: [10000, 19999], high: [20000, 29999], premium: [30000, Infinity] };
    const [lower, upper] = ranges[price];
    return mainFees(school).some(fee => fee.min <= upper && fee.max >= lower);
  }

  function matchesPreset(school) {
    if (preset === "private") return school.level === "本科" && school.nature === "民办";
    if (preset === "college") return school.level === "专科";
    if (preset === "211") return school.flags.includes("211");
    if (preset === "private2") {
      return school.level === "本科" && school.nature === "民办" && Boolean(school.batches["2"]);
    }
    return true;
  }

  function admissionKinds(school) {
    return [...new Set((school.admissions ?? []).map(record => record.kind))];
  }

  function matchesAdmission(school, filter) {
    if (!filter) return true;
    const kinds = admissionKinds(school);
    return filter === "any" ? kinds.length > 0 : kinds.includes(filter);
  }

  function getResults() {
    const query = normalized($("search").value).trim().split(/\s+/).filter(Boolean);
    const city = $("city").value;
    const level = $("level").value;
    const nature = $("nature").value;
    const admission = $("admission").value;
    const price = $("price").value;
    const sort = $("sort").value;
    const matched = schools.filter(school => {
      const kinds = admissionKinds(school);
      const searchText = normalized([school.name, school.id, school.city, statusText(school), ...school.aliases,
        ...school.flags, school.batches["1"] ? "历史一本" : "",
        school.batches["2"] ? (school.nature === "民办" ? "历史二本 民办二本" : "历史二本") : "",
        ...kinds.map(kind => admissionsLabels[kind]),
        kinds.includes("art") ? "艺考 艺术生" : "",
        kinds.some(kind => kind !== "art") ? "体育生 体育特长生" : "",
        ...(school.admissions ?? []).flatMap(record => record.items),
        ...(school.tuition?.majors ?? [])].join(" "));
      return (view === "all" || saved.has(school.id))
        && matchesPreset(school)
        && (!city || city === school.city) && (!level || level === school.level) && (!nature || nature === school.nature)
        && matchesAdmission(school, admission) && matchPrice(school, price)
        && query.every(term => searchText.includes(term));
    });
    if (sort === "name") return matched.sort((a, b) => names.compare(a.name, b.name));
    if (sort === "fee-unknown") {
      return matched.sort((a, b) => Number(Boolean(a.tuition)) - Number(Boolean(b.tuition)));
    }
    if (sort === "fee-up" || sort === "fee-down") {
      const direction = sort === "fee-up" ? 1 : -1;
      return matched.sort((a, b) => {
        const first = feeBounds(a)?.min;
        const second = feeBounds(b)?.min;
        if (first == null && second == null) return 0;
        if (first == null) return 1;
        if (second == null) return -1;
        return (first - second) * direction;
      });
    }
    return matched;
  }

  function tags(school) {
    const type = school.nature === "中外合作办学" ? "joint" : school.level === "专科" ? "college"
      : school.nature === "民办" ? "private" : "";
    const list = [[statusText(school), type]];
    for (const flag of school.flags) list.push([flag, "flag"]);
    if (school.batches["1"]) list.push(["历史一本", "old"]);
    if (school.batches["2"]) list.push(["历史二本", "old"]);
    return list.map(([label, theme]) => `<span class="tag ${theme}">${esc(label)}</span>`).join("");
  }

  function renderFee(school) {
    const fee = school.tuition;
    if (!fee) return `<span class="unknown">待查询</span>
      <span class="fee-search">${sourceLink(tuitionSearchUrl(school), "查学费")}</span>`;
    const bounds = feeBounds(school);
    if (!bounds) return `<span class="unknown">仅有专项收费</span><span class="fee-note">${fee.year} 年</span>`;
    if (fee.average) {
      const approximate = fee.average.type === "official" ? "" : "约 ";
      const caption = fee.average.type === "official" ? "官方均值" : "计划加权均值";
      return `<span class="fee-value">${approximate}${number.format(fee.average.value)}</span>
        <span class="fee-note">${fee.year} 年 · ${caption}</span>`;
    }
    return `<span class="fee-value">${formatRange(bounds.min, bounds.max)}</span>
      <span class="fee-note">${fee.year} 年 · ${bounds.min === bounds.max ? "已收录标准" : "已收录区间"}</span>`;
  }

  function renderRow(school) {
    const isSaved = saved.has(school.id);
    const action = isSaved ? "取消收藏" : "收藏";
    const name = esc(school.name);
    const admissions = renderAdmissionTags(school);
    return `<tr>
      <td><button class="school-name" data-school="${school.id}">${name}</button>
      <span class="school-code"><span class="mobile-city">${esc(school.city)} · </span>${school.id}</span></td>
      <td class="school-city">${esc(school.city)}</td>
      <td><div class="tags">${tags(school)}</div>${admissions ? `<div class="tags mobile-admissions">${admissions}</div>` : ""}</td>
      <td class="admissions-cell">${admissions ? `<div class="tags">${admissions}</div>` : '<span class="unknown">—</span>'}</td>
      <td>${renderFee(school)}</td>
      <td><button class="star" type="button" data-save="${school.id}" aria-label="${action}${name}" aria-pressed="${isSaved}" title="${action}">${isSaved ? "★" : "☆"}</button></td>
    </tr>`;
  }

  function renderAdmissionTags(school) {
    return admissionKinds(school).map(kind =>
      `<span class="tag admission-${kind}">${admissionsLabels[kind]}</span>`).join("");
  }

  function renderPagination(pageCount) {
    const pagination = $("pagination");
    pagination.hidden = !results.length;
    if (!results.length) return;
    const first = (page - 1) * pageSize + 1;
    const last = Math.min(page * pageSize, results.length);
    const numbers = Array.from({ length: pageCount }, (_, index) => index + 1)
      .filter(item => item === 1 || item === pageCount || Math.abs(item - page) <= 1);
    const buttons = numbers.map((item, index) => `${index > 0 && item - numbers[index - 1] > 1 ? "<span>…</span>" : ""}
      <button data-page="${item}" aria-label="第 ${item} 页" ${item === page ? 'aria-current="page"' : ""}>${item}</button>`).join("");
    pagination.innerHTML = `<span>第 ${first}–${last} 所，共 ${results.length} 所</span>${pageCount > 1 ? `
      <div class="page-buttons" role="group" aria-label="结果分页">
        <button data-page="${page - 1}" ${page === 1 ? "disabled" : ""}>上一页</button>${buttons}
        <button data-page="${page + 1}" ${page === pageCount ? "disabled" : ""}>下一页</button>
      </div>` : ""}`;
  }

  function render() {
    results = getResults();
    const pageCount = Math.max(1, Math.ceil(results.length / pageSize));
    page = Math.min(page, pageCount);
    const tuitionCount = results.filter(school => school.tuition).length;
    $("result-count").innerHTML = `匹配 <strong>${results.length}</strong> 所院校<span>已收录学费 ${tuitionCount} 所</span>`;
    $("rows").innerHTML = results.slice((page - 1) * pageSize, page * pageSize).map(renderRow).join("");
    $("empty").hidden = Boolean(results.length);
    $("empty").innerHTML = view === "saved" && !saved.size
      ? '<strong>还没有收藏的院校</strong><p>在院校列表点星标，之后就能在这里查看。</p><button class="button secondary" data-view="all">浏览院校</button>'
      : '<strong>没有符合条件的院校</strong><p>试试缩短搜索词，或放宽城市、类型和学费条件。</p><button class="button secondary" data-clear>清除筛选</button>';
    $("export").disabled = !results.length;
    $("fee-queue").setAttribute("aria-pressed", $("price").value === "unknown");
    $("saved-badge").textContent = saved.size;
    $("results-title").textContent = view === "saved" ? "我的收藏" : "院校检索";
    $("results-subtitle").textContent = view === "saved" ? "收藏保存在当前浏览器，可导出筛选后的名单。" : "筛选江苏普通高校与已收录的公开招生数据。";
    document.querySelectorAll(".nav-link").forEach(button => {
      const selected = view === button.dataset.view;
      button.classList.toggle("current", selected);
      button.setAttribute("aria-pressed", selected);
    });
    document.querySelectorAll("[data-preset]").forEach(button => button.setAttribute("aria-pressed", preset === button.dataset.preset));
    document.querySelectorAll("[data-city]").forEach(button => button.setAttribute("aria-pressed", $("city").value === button.dataset.city));
    renderPagination(pageCount);
  }

  function resetFilters() {
    for (const id of filters) $(id).value = id === "sort" ? "official" : "";
    preset = "all";
    page = 1;
  }

  function applyFilter() {
    page = 1;
    render();
  }

  function openDialog(kicker, title, content) {
    $("dialog-kicker").textContent = kicker;
    $("dialog-content").innerHTML = `<h2 id="dialog-title">${esc(title)}</h2>${content}`;
    $("dialog").showModal();
    $("dialog").scrollTop = 0;
    $("close-dialog").focus();
  }

  function showSchool(school) {
    const { tuition, batches } = school;
    const history = Object.entries(batches).map(([key, subjects]) => {
      const oldName = school.batchNames?.[key];
      const links = subjects.map(subject => sourceLink(sources.history[key][subject], subject)).join(" · ");
      return `<li>本科第${key === "1" ? "一" : "二"}批${oldName ? `，表列校名 ${esc(oldName)}` : ""} · ${links}</li>`;
    }).join("");
    const average = tuition?.average;
    const feeRows = tuition?.fees.map(fee => `<div class="detail-fee"><span>${esc(fee.label)}${fee.special ? " · 专项" : ""}</span><strong>${formatRange(fee.min, fee.max)} 元/年</strong></div>`).join("");
    const admissions = (school.admissions ?? []).map(record =>
      `<li><strong>${esc(record.label)}</strong>${record.items.length ? ` · ${record.items.map(esc).join("、")}` : ""} · ${sourceLink(record.url, "查看来源")}</li>`).join("");
    openDialog(school.city, school.name, `
      <div class="tags">${tags(school)}</div>
      <section class="detail-section"><h3>院校信息</h3>
        <p>学校标识码 ${school.id} · 主管部门 ${esc(school.agency)}</p>
        <div class="detail-links">${school.site ? sourceLink(school.site, "学校官网") : ""}${sourceLink(sources.province, "江苏省教育厅院校名录")}</div>
      </section>
      <section class="detail-section"><h3>公开学费${tuition ? ` · ${tuition.year} 年` : ""}</h3>
        ${tuition ? `
          ${feeRows}
          ${average ? `<p>${average.type === "official" ? "官方均值" : "按招生计划估算"} ${number.format(average.value)} 元/年。口径为${esc(average.scope)}。</p>` : "<p>本条展示已收录的收费标准。</p>"}
          ${tuition.note ? `<p>${esc(tuition.note)}</p>` : ""}
          <div class="detail-links">${sourceLink(tuition.source, tuition.title)}</div>
          ${tuition.majors?.length ? `<details><summary>查看已收录专业（${tuition.majors.length} 项）</summary><p>${tuition.majors.map(esc).join("、")}</p></details>` : ""}
        ` : `<p>待查询。请核对学校招生网公布的收费公示、招生章程或招生计划。</p>
          <div class="detail-links">${sourceLink(tuitionSearchUrl(school), "搜索该校公开学费")}</div>`}
      </section>
      <section class="detail-section"><h3>艺术与特长招生 · 2026 年</h3>
        ${admissions ? `<ul>${admissions}</ul>` : "<p>暂无已收录的艺体招生记录。完整招生项目请查学校当年简章。</p>"}
      </section>
      <section class="detail-section"><h3>江苏历史招生批次</h3>
        ${history ? `<p>2020 年普通类平行志愿投档记录</p><ul>${history}</ul>` : "<p>首版没有匹配到该校的 2020 年普通类一本或二本投档记录。</p>"}
        <div class="detail-links">${sourceLink(sources.current, "江苏 2026 年录取批次")}</div>
      </section>`);
  }

  function showMethod() {
    const tuitionCount = schools.filter(school => school.tuition).length;
    const planCount = schools.filter(school => school.tuition?.average).length;
    const majorCount = schools.filter(school => school.tuition?.majors?.length).length;
    const historyCount = schools.filter(school => Object.keys(school.batches).length).length;
    const admissionsCount = schools.filter(school => school.admissions?.length).length;
    const admissionsSources = Object.values(sources.admissions ?? {})
      .map(source => sourceLink(source.url, source.label)).join("");
    openDialog("数据口径", "来源与覆盖范围", `
      <section class="detail-section"><h3>江苏普通高校</h3>
        <p>收录 ${schools.length} 所学校。学校名称、层次和标识码以教育部 2026 年 6 月名单为准，城市按省教育厅名录中的设区市归属，办学性质以省教育厅名录为准。大专对应高职（专科）层次。985 和 211 是历史建设项目标签。</p>
        <div class="detail-links">${sourceLink(sources.province, "江苏省教育厅名录")}${sourceLink(sources.national, "教育部全国普通高校名单")}${sourceLink(sources.flag211, "211 工程名单")}${sourceLink(sources.flag985, "985 工程名单")}</div>
      </section>
      <section class="detail-section"><h3>历史一本、二本</h3>
        <p>首版对照江苏省教育考试院 2020 年文科、理科本科一批、二批普通类平行志愿投档表，共匹配 ${historyCount} 所学校。同一所学校可能同时出现于两个批次，少量校名变更见院校详情。民办二本筛选按现为民办本科且有二批记录。“一本”“二本”对应历史记录。</p>
        <div class="detail-links">${sourceLink(sources.current, "2026 年江苏录取工作通知")}${sourceLink(sources.history["1"]["文科"], "2020 一本 · 文科")}${sourceLink(sources.history["1"]["理科"], "2020 一本 · 理科")}${sourceLink(sources.history["2"]["文科"], "2020 二本 · 文科")}${sourceLink(sources.history["2"]["理科"], "2020 二本 · 理科")}</div>
      </section>
      <section class="detail-section"><h3>学费和专业</h3>
        <p>目前有 ${tuitionCount} 所附学费来源、${majorCount} 所附可搜索的专业、${planCount} 所有均值口径。学费用于比较就读成本，以元/生/年列示。参考档按已收录的非专项收费匹配，费用排序按学费下限。</p>
        <p>有完整的指定范围招生计划时，以各专业年学费乘计划人数后求和，再除以总计划人数。估算值对应详情注明的生源省份、年份和招生类别。请按具体专业、入学年份和学校原文核对。</p>
      </section>
      <section class="detail-section"><h3>艺术与特长招生</h3>
        <p>已收录 ${admissionsCount} 所有 2026 年公开记录的院校。艺术和体育统考依据江苏投档记录，校考、高水平运动队及体育单招依据各自的公开招生文件。高水平艺术团自 2024 年起改为在校生遴选。</p>
        <div class="detail-links">${admissionsSources}</div>
      </section>`);
  }

  function toggleSaved(id) {
    const button = document.querySelector(`[data-save="${id}"]`);
    const removed = saved.delete(id);
    if (!removed) saved.add(id);
    let persisted = true;
    try { localStorage.setItem(storageKey, JSON.stringify([...saved])); }
    catch { persisted = false; }
    render();
    if (button) document.querySelector(`[data-save="${id}"]`)?.focus({ preventScroll: true });
    notify(persisted ? (removed ? "已取消收藏" : "已收藏") : "收藏仅在当前页面有效");
  }

  function csvCell(value) {
    // Prefix formula-like values so editors open the exported data as text.
    const plain = String(value ?? "");
    const protectedValue = /^[=+\-@\t\r]/.test(plain) ? "'" + plain : plain;
    return '"' + protectedValue.replaceAll('"', '""') + '"';
  }

  function exportCsv() {
    if (!results.length) return;
    const header = ["学校", "学校标识码", "城市", "办学层次", "办学性质", "建设标签",
      "2026艺体招生", "艺体招生来源", "学费年份", "已收录学费下限（元/年）", "已收录学费上限（元/年）",
      "均值（元/年）", "均值口径", "学费来源", "待查学费搜索链接", "学校官网"];
    const records = results.map(school => {
      const fee = school.tuition;
      const bounds = feeBounds(school);
      return [school.name, school.id, school.city, school.level, school.nature, school.flags.join("、"),
        (school.admissions ?? []).map(record => [record.label, ...record.items].join(" ")).join("；"),
        [...new Set((school.admissions ?? []).map(record => record.url))].join("；"), fee?.year, bounds?.min, bounds?.max,
        fee?.average?.value, fee?.average ? `${fee.average.type === "official" ? "官方均值" : "按招生计划估算"} · ${fee.average.scope}` : "",
        fee?.source, fee ? "" : tuitionSearchUrl(school), school.site];
    });
    const content = [header, ...records].map(record => record.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = view === "saved" ? "江苏院校收藏.csv" : "江苏院校筛选结果.csv";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify(`已导出 ${results.length} 所院校`);
  }

  $("total-n").textContent = schools.length;
  $("undergrad-n").textContent = schools.filter(school => school.level === "本科").length;
  $("college-n").textContent = schools.filter(school => school.level === "专科").length;
  $("footer-coverage").textContent = `江苏省 · 2026 年院校基础信息 · 学费已收录 ${schools.filter(school => school.tuition).length} 所`;
  $("city").insertAdjacentHTML("beforeend", cities.map(city => `<option>${esc(city)}</option>`).join(""));
  $("city-grid").innerHTML = cities.map(city => {
    const count = schools.filter(school => school.city === city).length;
    return `<button class="city-tile" data-city="${esc(city)}" aria-label="${esc(city)}，${count} 所院校" aria-pressed="false"><span>${esc(city.replace(/市$/, ""))}</span><span>${count}</span></button>`;
  }).join("");

  for (const id of filters) $(id).addEventListener(id === "search" ? "input" : "change", applyFilter);
  $("reset").addEventListener("click", () => { resetFilters(); render(); });
  $("fee-queue").addEventListener("click", () => {
    $("price").value = $("price").value === "unknown" ? "" : "unknown";
    applyFilter();
  });
  $("export").addEventListener("click", exportCsv);
  $("close-dialog").addEventListener("click", () => $("dialog").close());
  $("dialog").addEventListener("click", event => {
    if (event.target !== $("dialog")) return;
    const area = $("dialog").getBoundingClientRect();
    if (event.clientX < area.left || event.clientX > area.right || event.clientY < area.top || event.clientY > area.bottom) $("dialog").close();
  });
  window.addEventListener("storage", event => {
    if (event.key === storageKey) { saved = readSaved(); render(); }
  });
  document.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button || button.disabled) return;
    const data = button.dataset;
    if ("method" in data) return showMethod();
    if (data.school) return showSchool(byId.get(data.school));
    if (data.save) return toggleSaved(data.save);
    if (data.view) {
      if (data.view !== view) { view = data.view; resetFilters(); render(); }
      return;
    }
    if (data.preset) { preset = data.preset; applyFilter(); return; }
    if (data.city) {
      if (view === "saved") { view = "all"; resetFilters(); }
      $("city").value = $("city").value === data.city ? "" : data.city;
      applyFilter();
      $("results-title").scrollIntoView({ block: "start" });
      return;
    }
    if (data.page) {
      page = Number(data.page);
      render();
      document.querySelector('[aria-current="page"]')?.focus({ preventScroll: true });
      $("result-count").scrollIntoView({ block: "start" });
      return;
    }
    if ("clear" in data) { resetFilters(); render(); $("search").focus(); }
  });

  render();
})();
