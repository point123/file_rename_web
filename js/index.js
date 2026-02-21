const disallowedChars = ["<", ">", ":", "\"", "/", "\\", "|", "?", "*"]

// --- i18n ---
const i18n = {
    zh: { title: "Pro Rename", source: "数据源", btnDir: "📁 文件夹", btnFiles: "📄文件", mode: "重命名模式", filter: "扩展名过滤", btnExec: "开始处理", old: "原文件名 ⇅", new: "预览 ⇅", time: "修改时间 ⇅", lang: "语言切换", confirmMSG: "确定对筛选出的文件执行批量重命名？", pending: "等待导入数据...", total: "总文件数", filtered: "已筛选" },
    en: { title: "Pro Rename", source: "Data Source", btnDir: "📁 folder", btnFiles: "📄files", mode: "Rename Mode", filter: "Ext Filter", btnExec: "START PROCESS", old: "Original Name ⇅", new: "Preview ⇅", time: "Modified Time ⇅", lang: "Language", confirmMSG: "Determine whether to perform batch renaming on the selected files?", pending: "waiting for import files...", total: "Total", filtered: "Filtered" }
};

// --- global status ---
let allHandles = []; // original handler
let filteredHandles = []; // filterd and sorted handler
let activeExts = new Set();
let currentPage = 1;
const pageSize = 10;
let sortField = 'name';
let sortDesc = false;

// --- core ---

// 1. get file data
async function wrapHandle(handle) {
    const file = await handle.getFile();
    return {
        handle,
        name: handle.name,
        ext: handle.name.slice(handle.name.lastIndexOf('.')).toLowerCase(),
        time: file.lastModified,
        timeStr: new Date(file.lastModified).toLocaleString()
    };
}

// 2. mode change
document.getElementById('modeSelect').addEventListener("change", (e) => {
    const isReplace = e.target.value === 'replace';
    document.getElementById('singleInputArea').style.display = isReplace ? 'none' : 'block';
    document.getElementById('dualInputArea').style.display = isReplace ? 'flex' : 'none';
    renderTable();
});

// 3. filter and sort
function applyFilterAndSort() {
    // filter ext
    filteredHandles = allHandles.filter(h => activeExts.size === 0 || activeExts.has(h.ext));

    // sort
    filteredHandles.sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];
        return sortDesc ? (valB > valA ? 1 : -1) : (valA > valB ? 1 : -1);
    });

    currentPage = 1;
    renderTable();
}

// 4. rename preview
function getNewName(oldName) {
    const mode = document.getElementById('modeSelect').value;
    const dotIdx = oldName.lastIndexOf('.');
    const base = dotIdx === -1 ? oldName : oldName.slice(0, dotIdx);
    const ext = dotIdx === -1 ? '' : oldName.slice(dotIdx);

    if (mode === 'suffix') return base + document.getElementById('mainInput').value + ext;
    if (mode === 'prefix') return document.getElementById('mainInput').value + oldName;
    if (mode === 'replace') {
        const find = document.getElementById('findInput').value;
        const replace = document.getElementById('replaceInput').value;
        return find ? oldName.replaceAll(find, replace) : oldName;
    }
    return oldName;
}

// 5. render table
function renderTable() {
    const start = (currentPage - 1) * pageSize;
    const pageData = filteredHandles.slice(start, start + pageSize);
    const tbody = document.getElementById('fileTableBody');
    tbody.innerHTML = '';

    pageData.forEach(h => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="old">${h.name}</td>
            <td class="new">${getNewName(h.name)}</td>
            <td class="col-time">${h.timeStr}</td>
        `;
        tbody.appendChild(tr);
    });

    const currentLang = document.getElementById('langSelect').value;
    document.getElementById('pageInfo').innerText = `Page ${currentPage} / ${Math.ceil(filteredHandles.length / pageSize) || 1}`;
    document.getElementById('t-statsInfo').innerText = 
        allHandles.length === 0 ? 
            i18n[currentLang].pending : 
            `${i18n[currentLang].total}: ${allHandles.length} | ${i18n[currentLang].filtered}: ${filteredHandles.length}`;
}

// --- event listener ---

// import directory
document.getElementById('t-btnDir').addEventListener("click",async () => {
    const dir = await window.showDirectoryPicker();
    allHandles = [];
    const exts = new Set();
    for await (const entry of dir.values()) {
        if (entry.kind === 'file') {
            const wrapped = await wrapHandle(entry);
            allHandles.push(wrapped);
            exts.add(wrapped.ext);
        }
    }
    renderExtTags(exts);
    applyFilterAndSort();
    document.getElementById('t-btnExec').disabled = false;
});

// import multiple files
document.getElementById('t-btnFiles').addEventListener("click", async () => {
    const files = await window.showOpenFilePicker({ multiple: true });
    allHandles = [];
    const exts = new Set();
    for (const handle of files) {
        const wrapped = await wrapHandle(handle);
        allHandles.push(wrapped);
        exts.add(wrapped.ext);
    }
    renderExtTags(exts);
    applyFilterAndSort();
    document.getElementById('t-btnExec').disabled = false;
});

// render tags
function renderExtTags(extSet) {
    const container = document.getElementById('extTags');
    container.innerHTML = '';
    [...extSet].sort().forEach(ext => {
        const span = document.createElement('span');
        span.className = 'tag';
        span.innerText = ext || 'no-ext';
        span.onclick = () => {
            span.classList.toggle('active');
            activeExts.has(ext) ? activeExts.delete(ext) : activeExts.add(ext);
            applyFilterAndSort();
        };
        container.appendChild(span);
    });
}

// sort
function resort(field) {
    if (sortField === field) sortDesc = !sortDesc;
    else { sortField = field; sortDesc = false; }
    applyFilterAndSort();
}
document.getElementById("t-old").addEventListener("click", () => resort("name"));
document.getElementById("t-time").addEventListener("click", () => resort("time"));

// pagination
document.getElementById('prevPage').addEventListener("click", () => { if (currentPage > 1) { currentPage--; renderTable(); } });
document.getElementById('nextPage').addEventListener("click", () => { if (currentPage * pageSize < filteredHandles.length) { currentPage++; renderTable(); } });

// exec
document.getElementById('t-btnExec').addEventListener("click", async () => {
    const currentLang = document.getElementById('langSelect').value;
    if (!confirm(i18n[currentLang].confirmMSG)) return;
    document.getElementById('progBar').style.display = 'block';
    const prog = document.getElementById('mainProg');

    let count = 0;
    for (const h of filteredHandles) {
        const newName = getNewName(h.name);
        if (newName !== h.name) {
            await h.handle.move(newName);
        }
        count++;
        prog.value = (count / filteredHandles.length) * 100;
    }
    alert("完成！");
    location.reload();
});

// change language
document.getElementById('langSelect').addEventListener("change", (e) => {
    const lang = e.target.value;
    
    Object.keys(i18n[lang]).forEach(key => {
        const el = document.getElementById('t-' + key);
        if (el) el.innerText = i18n[lang][key];
    });
    renderTable();
});

// input refresh preview
document.getElementById('mainInput').addEventListener("input",renderTable);
document.getElementById('findInput').addEventListener("input",renderTable);
document.getElementById('replaceInput').addEventListener("input",renderTable)

// TODO 等待导入数据i18nbug、模式名称i18n、优化代码(addEventListener)、排序高亮、新模式、自定义页大小