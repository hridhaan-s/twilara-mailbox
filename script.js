const API = "https://script.google.com/macros/s/AKfycbw546cYoRVqRNu7yp9TgkUp4vPsi5oYEdfsINd3Bjl8fhwL6aWUvsWru9YgPqEUKdzQ/exec";
const HARDCODED_PIN = "2026";

// DOM Elements
const authView = document.getElementById("authView");
const appView = document.getElementById("appView");
const pinInputs = document.querySelectorAll(".pin-digit");
const unlockBtn = document.getElementById("unlockBtn");
const authError = document.getElementById("authError");

const searchButton = document.getElementById("searchButton");
const searchInput = document.getElementById("searchInput");
const result = document.getElementById("result");

// --- PIN Authentication Logic ---
pinInputs.forEach((input, index) => {
    input.addEventListener("input", (e) => {
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
    } else {
        authError.textContent = "Invalid PIN. Try again.";
        pinInputs.forEach(i => i.value = "");
        pinInputs[0].focus();
    }
}

// --- Search & Fetch Logic ---
searchButton.addEventListener("click", search);
searchInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") search();
});

async function search() {
    let query = searchInput.value.trim().toLowerCase();
    if (!query) return;

    if (!query.includes("@")) {
        query += "@twilara.lol";
    }

    result.innerHTML = `
        <div class="loading">
            <div class="loader"></div>
        </div>
    `;

    try {
        const response = await fetch(
            `${API}?q=${encodeURIComponent(query.replace("@twilara.lol", ""))}`
        );

        const data = await response.json();

        if (!data.success) {
            result.innerHTML = `
                <div class="mail">
                    <h2>No email found</h2>
                </div>
            `;
            return;
        }

        // Extract primary link if present in content
        const extractedLink = extractLink(data.html || data.body);

        result.innerHTML = `
            <div class="mail">
                <h2>${escapeHTML(data.subject || "No Subject")}</h2>
                <p><strong>From:</strong> ${escapeHTML(data.from || "Unknown")}</p>
                <p><strong>To:</strong> ${escapeHTML(data.to || "")}</p>
                <hr style="border-color: #222; margin: 15px 0;">

                ${(data.code || extractedLink) ? `
                    <div class="actionBox">
                        ${data.code ? `
                            <h3>Verification Code</h3>
                            <h1>${data.code}</h1>
                        ` : ''}
                        
                        <div class="action-buttons">
                            ${data.code ? `
                                <button onclick="copyCode('${data.code}')">Copy Code</button>
                            ` : ''}
                            
                            ${extractedLink ? `
                                <button onclick="window.open('${extractedLink}', '_blank')">Open Link</button>
                            ` : ''}
                        </div>
                    </div>
                    <hr style="border-color: #222; margin: 15px 0;">
                ` : ""}

                <div class="emailBody">
                    ${data.html ? data.html : `<pre style="white-space: pre-wrap;">${escapeHTML(data.body)}</pre>`}
                </div>
            </div>
        `;

    } catch (err) {
        result.innerHTML = `
            <div class="mail">
                <h2>Error</h2>
                <p>${escapeHTML(err.message || String(err))}</p>
            </div>
        `;
    }
}

function copyCode(code) {
    navigator.clipboard.writeText(code);
    alert("Verification code copied!");
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
