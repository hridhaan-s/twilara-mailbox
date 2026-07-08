const API = "https://script.google.com/macros/s/AKfycbw546cYoRVqRNu7yp9TgkUp4vPsi5oYEdfsINd3Bjl8fhwL6aWUvsWru9YgPqEUKdzQ/exec";

const searchButton = document.getElementById("searchButton");
const searchInput = document.getElementById("searchInput");
const result = document.getElementById("result");

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
            Searching...
        </div>
    `;

    try {

        const response = await fetch(
            `${API}?q=${encodeURIComponent(
                query.replace("@twilara.lol", "")
            )}`
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

        result.innerHTML = `
            <div class="mail">

                <h2>${escapeHTML(data.subject)}</h2>

                <p><strong>From:</strong> ${escapeHTML(data.from)}</p>

                <p><strong>To:</strong> ${escapeHTML(data.to)}</p>

                <hr>

                ${
                    data.code
                        ? `
                        <div class="otpBox">
                            <h3>Verification Code</h3>

                            <h1>${data.code}</h1>

                            <button onclick="copyCode('${data.code}')">
                                Copy Code
                            </button>
                        </div>

                        <hr>
                        `
                        : ""
                }

                <div class="emailBody">

                    ${
                        data.html
                            ? data.html
                            : `<pre>${escapeHTML(data.body)}</pre>`
                    }

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

function escapeHTML(text) {

    if (!text) return "";

    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}