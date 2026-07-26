const API = "https://script.google.com/macros/s/AKfycbw546cYoRVqRNu7yp9TgkUp4vPsi5oYEdfsINd3Bjl8fhwL6aWUvsWru9YgPqEUKdzQ/exec";
const HARDCODED_PIN = "2026";

const HISTORY_KEY = "twilara_history";
const HISTORY_LIMIT = 8;
const HISTORY_TTL_MS = 30 * 60 * 1000; // 30 min — matches typical code lifespan
const IDLE_LOCK_MS = 5 * 60 * 1000;     // re-lock after 5 min of inactivity
const AUTO_REFRESH_MS = 8 * 1000;

// DOM Elements
const authView = document.getElementById("authView");
const appView = document.getElementById("appView");
const pinInputs = document.querySelectorAll(".pin-digit");
const pinContainer = document.querySelector(".pin-container");
const unlockBtn = document.getElementById("unlockBtn");
const authError = document.getElementById("authError");

const searchButton = document.getElementById("searchButton");
const searchInput = document.getElementById("searchInput");
const result = document.getElementById("result");

const historyToggle = document.getElementById("historyToggle");
const historyPanel = document.getElementById("historyPanel");
const historyList = document.getElementById("historyList");
const clearHistoryBtn = document.getElementById("clearHistory");
const autoRefreshToggle = document.getElementById("autoRefreshToggle");
const toastContainer = document.getElementById("toastContainer");

let history = loadHistory();
let idleTimer = null;
let autoRefreshTimer = null;
let lastQuery = "";

// --- PIN Authentication Logic ---
pinInputs.forEach((input, index) => {
    input.addEventListener("input", (e) => {
        e.target.value = e.target.value.replace(/[^0-9]/g, "");
        if (e.target.value.length === 1 && index < pinInputs.length - 1) {
            pinInputs[index + 1].focus();
        }
    });

    input.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && !e.target.value && index > 0) {
            pinInputs[index - 1].focus();
        }
        if (e.key === "Enter") verifyPin();
    });
});

unlockBtn.addEventListener("click", verifyPin);

function verifyPin() {
    let enteredPin = "";
    pinInputs.forEach(i => enteredPin += i.value);

    if (enteredPin === HARDCODED_PIN) {
        authView.classList.add("hidden");
        appView.classList.remove("hidden");
        authError.textContent = "";
        searchInput.focus();
        pruneHistory();
        renderHistoryPanel();
        startIdleWatch();
    } else {
        authError.textContent = "Invalid PIN. Try again.";
        pinContainer.classList.add("shake");
        setTimeout(() => pinContainer.classList.remove("shake"), 400);
        pinInputs.forEach(i => i.value = "");
        pinInputs[0].focus();
    }
}

function lockApp(reason) {
    stopIdleWatch();
    stopAutoRefresh();
    autoRefreshToggle.checked = false;
    appView.classList.add("hidden");
    authView.classList.remove("hidden");
    pinInputs.forEach(i => i.value = "");
    pinInputs[0].focus();
    if (reason) showToast(reason);
}

// --- Idle auto-lock ---
function startIdleWatch() {
    resetIdleTimer();
    ["mousemove", "keydown", "click", "scroll", "touchstart"].forEach(evt => {
        document.addEventListener(evt, resetIdleTimer);
    });
}

function stopIdleWatch() {
    clearTimeout(idleTimer);
    ["mousemove", "keydown", "click", "scroll", "touchstart"].forEach(evt => {
        document.removeEventListener(evt, resetIdleTimer);
    });
}

function resetIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => lockApp("Locked after inactivity"), IDLE_LOCK_MS);
}

// --- Keyboard shortcut: Cmd/Ctrl+K focuses search ---
document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        if (!appView.classList.contains("hidden")) {
            e.preventDefault();
            searchInput.focus();
            searchInput.select();
        }
    }
});

// --- Search & Fetch Logic ---
searchButton.addEventListener("click", () => search());
searchInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") search();
});

autoRefreshToggle.addEventListener("change", () => {
    if (autoRefreshToggle.checked) {
        if (!lastQuery) {
            showToast("Fetch a mailbox first to enable auto-refresh");
            autoRefreshToggle.checked = false;
            return;
        }
        startAutoRefresh();
    } else {
        stopAutoRefresh();
    }
});

function startAutoRefresh() {
    stopAutoRefresh();
    autoRefreshTimer = setInterval(() => search(lastQuery, { silent: true }), AUTO_REFRESH_MS);
}

function stopAutoRefresh() {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
}

async function search(presetQuery, opts) {
    const options = opts || {};
    let query = (presetQuery !== undefined ? presetQuery : searchInput.value).trim().toLowerCase();
    if (!query) return;

    if (!query.includes("@")) {
        query += "@twilara.lol";
    }
    searchInput.value = query;
    lastQuery = query;

    if (!options.silent) {
        searchButton.disabled = true;
        result.innerHTML = `
            <div class="loading">
                <div class="skel-line skel-title"></div>
                <div class="skel-line skel-sub"></div>
                <div class="skel-line skel-sub short"></div>
                <div class="skel-block"></div>
            </div>
        `;
    }

    try {
        const response = await fetch(
            `${API}?q=${encodeURIComponent(query.replace("@twilara.lol", ""))}`
        );

        const data = await response.json();

        if (!data.success) {
            if (!options.silent) {
                result.innerHTML = `
                    <div class="mail">
                        <h2>No email found</h2>
                        <p>Nothing has arrived yet for <strong>${escapeHTML(query)}</strong>.</p>
                    </div>
                `;
            }
            return;
        }

        renderMail(data, query);
        addToHistory(query, data);

    } catch (err) {
        if (!options.silent) {
            result.innerHTML = `
                <div class="mail">
                    <h2>Error</h2>
                    <p>${escapeHTML(err.message || String(err))}</p>
                </div>
            `;
        } else {
            showToast("Auto-refresh couldn't reach the mailbox");
        }
    } finally {
        if (!options.silent) searchButton.disabled = false;
    }
}

function renderMail(data) {
    const extractedLink = extractLink(data.html || data.body);
    const receivedAt = formatReceivedTime(data);

    result.innerHTML = `
        <div class="mail">
            <h2>${escapeHTML(data.subject || "No Subject")}</h2>
            <p><strong>From:</strong> ${escapeHTML(data.from || "Unknown")}</p>
            <p><strong>To:</strong> ${escapeHTML(data.to || "")}</p>
            ${receivedAt ? `<p><strong>Received:</strong> ${escapeHTML(receivedAt)}</p>` : ""}
            <hr>

            ${(data.code || extractedLink) ? `
                <div class="actionBox">
                    ${data.code ? `
                        <h3>Verification Code</h3>
                        <h1>${data.code}</h1>
                    ` : ''}

                    <div class="action-buttons">
                        ${data.code ? `
                            <button onclick="copyCode('${data.code}', this)">Copy Code</button>
                        ` : ''}

                        ${extractedLink ? `
                            <button onclick="window.open('${extractedLink}', '_blank')">Open Link</button>
                        ` : ''}
                    </div>
                </div>
                <hr>
            ` : ""}

            <div class="emailBody">
                ${data.html ? `<iframe id="emailFrame" class="emailBody-frame" sandbox="allow-same-origin allow-popups" referrerpolicy="no-referrer"></iframe>` : `<pre style="white-space: pre-wrap;">${escapeHTML(data.body)}</pre>`}
            </div>
        </div>
    `;

    // Render the original email in an isolated frame so its own fonts/
    // colors/layout show up untouched by this app's dark theme, and so
    // no script or auto-navigation in the message body can execute.
    if (data.html) {
        const frame = document.getElementById("emailFrame");
        frame.srcdoc = data.html;
        frame.addEventListener("load", () => {
            try {
                const doc = frame.contentWindow.document;
                frame.style.height = doc.documentElement.scrollHeight + "px";
            } catch (e) {
                // sandboxed cross-origin read blocked; keep default height
            }
        });
    }
}

function copyCode(code, btn) {
    copyToClipboard(code).then((ok) => {
        if (!btn) return;
        const original = btn.textContent;
        btn.textContent = ok ? "Copied \u2713" : "Copy failed";
        btn.disabled = true;
        setTimeout(() => {
            btn.textContent = original;
            btn.disabled = false;
        }, 1500);
        if (!ok) showToast("Couldn't copy — select and copy the code manually");
    });
}

function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text).then(() => true).catch(() => copyViaExecCommand(text));
    }
    return Promise.resolve(copyViaExecCommand(text));
}

function copyViaExecCommand(text) {
    try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(textarea);
        return ok;
    } catch (e) {
        return false;
    }
}

// --- Session history (client-side only; nothing new sent to the backend) ---
function loadHistory() {
    try {
        return JSON.parse(sessionStorage.getItem(HISTORY_KEY)) || [];
    } catch (e) {
        return [];
    }
}

function saveHistory() {
    try {
        sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
        // storage unavailable (private browsing, etc.) — history just won't persist
    }
}

function pruneHistory() {
    const now = Date.now();
    const before = history.length;
    history = history.filter(entry => now - entry.fetchedAt < HISTORY_TTL_MS * 2);
    if (history.length !== before) saveHistory();
}

function addToHistory(handle, data) {
    history.unshift({ handle, data, fetchedAt: Date.now() });
    history = history.slice(0, HISTORY_LIMIT);
    saveHistory();
    renderHistoryPanel();
}

function renderHistoryPanel() {
    if (!history.length) {
        historyList.innerHTML = `<div class="history-empty">Nothing fetched yet this session.</div>`;
        return;
    }

    historyList.innerHTML = history.map((entry, i) => {
        const expired = Date.now() - entry.fetchedAt > HISTORY_TTL_MS;
        const subject = entry.data.subject || "No Subject";
        const receivedAt = formatReceivedTime(entry.data);
        return `
            <button class="history-item ${expired ? "expired" : ""}" data-index="${i}">
                <div class="history-top">
                    <span>${escapeHTML(entry.handle)}</span>
                    <span class="history-time">${formatRelativeTime(entry.fetchedAt)}</span>
                </div>
                <span class="history-sub">${escapeHTML(subject)}</span>
                ${receivedAt ? `<span class="history-sub history-received">${escapeHTML(receivedAt)}</span>` : ""}
            </button>
        `;
    }).join("");
}

historyList.addEventListener("click", (e) => {
    const item = e.target.closest(".history-item");
    if (!item) return;
    const entry = history[Number(item.dataset.index)];
    if (!entry) return;
    searchInput.value = entry.handle;
    lastQuery = entry.handle;
    renderMail(entry.data);
    historyPanel.classList.add("hidden");
});

historyToggle.addEventListener("click", () => {
    pruneHistory();
    renderHistoryPanel();
    historyPanel.classList.toggle("hidden");
});

clearHistoryBtn.addEventListener("click", () => {
    history = [];
    saveHistory();
    renderHistoryPanel();
    showToast("History cleared");
});

// Keep relative "Xm ago" labels current while the panel is open
setInterval(() => {
    if (!historyPanel.classList.contains("hidden")) renderHistoryPanel();
}, 15000);

function formatRelativeTime(ts) {
    const seconds = Math.floor((Date.now() - ts) / 1000);
    if (seconds < 10) return "just now";
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
}

function formatReceivedTime(data) {
    const candidate = data.date || data.timestamp || data.receivedAt || data.time;
    if (!candidate) return null;

    const parsed = new Date(candidate);
    if (isNaN(parsed.getTime())) return String(candidate);

    return parsed.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
    });
}

// --- Toast notifications ---
function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.classList.add("toast-out");
        setTimeout(() => toast.remove(), 200);
    }, 2800);
}

function extractLink(content) {
    if (!content) return null;
    const urlRegex = /(https?:\/\/[^\s"<]+)/g;
    const matches = content.match(urlRegex);
    return matches ? matches[0] : null;
}

function escapeHTML(text) {
    if (!text) return "";
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
