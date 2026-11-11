const $ = id => document.getElementById(id);

const fallbackThumb = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="100%" height="100%" fill="#292929"/><text x="50%" y="50%" fill="#888" font-size="42" text-anchor="middle" font-family="Arial">Thumbnail preview</text></svg>'
);

const fallbackAvatar = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100%" height="100%" fill="#383838"/><circle cx="50" cy="38" r="19" fill="#888"/><path d="M15 100c2-25 17-37 35-37s33 12 35 37" fill="#888"/></svg>'
);

let thumbnail = fallbackThumb;
let avatar = fallbackAvatar;

function videoId(url) {
    try {
        const u = new URL(url);

        if (u.hostname.includes("youtu.be")) {
            return u.pathname.split("/").filter(Boolean)[0];
        }

        if (u.searchParams.get("v")) {
            return u.searchParams.get("v");
        }

        const parts = u.pathname.split("/").filter(Boolean);
        const marker = parts.findIndex(p =>
            ["shorts", "embed", "live"].includes(p)
        );

        return marker >= 0 ? parts[marker + 1] : null;
    } catch {
        return null;
    }
}

function setImage(element, src, fallback) {
    element.onerror = () => {
        element.onerror = null;
        element.src = fallback;
    };

    element.src = src;
}

function refresh() {
    $("previewTitle").textContent =
        $("title").value.trim() || "Your video title";

    $("previewChannel").textContent =
        $("channel").value.trim() || "Channel name";

    $("previewViews").textContent =
        $("views").value.trim() || "Views · upload date";

    setImage($("previewThumbnail"), thumbnail, fallbackThumb);
    setImage($("previewAvatar"), avatar, fallbackAvatar);
}

$("loadVideo").addEventListener("click", async () => {
    const id = videoId($("videoUrl").value.trim());

    if (!id) {
        $("status").textContent = "Enter a valid YouTube video link.";
        return;
    }

    $("status").textContent = "Loading video details…";

    thumbnail = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

    setImage($("previewThumbnail"), thumbnail, fallbackThumb);

    try {
        const response = await fetch(
            `https://www.youtube.com/oembed?url=${encodeURIComponent(
                "https://www.youtube.com/watch?v=" + id
            )}&format=json`
        );

        if (!response.ok) {
            throw new Error("Metadata unavailable");
        }

        const data = await response.json();

        $("title").value = data.title || "";
        $("channel").value = data.author_name || "";

        if (data.thumbnail_url) {
            thumbnail = data.thumbnail_url;
        }

        refresh();

        $("status").textContent =
            "Video loaded. You can change any field.";
    } catch {
        refresh();

        $("status").textContent =
            "Thumbnail loaded. Enter the title and channel manually.";
    }
});

$("thumbnailUpload").addEventListener("change", event => {
    const file = event.target.files[0];

    if (!file) return;

    thumbnail = URL.createObjectURL(file);
    refresh();
});

$("avatarUpload").addEventListener("change", event => {
    const file = event.target.files[0];

    if (!file) return;

    avatar = URL.createObjectURL(file);
    refresh();
});

["title", "channel", "views"].forEach(id => {
    $(id).addEventListener("input", refresh);
});

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const image = new Image();

        image.crossOrigin = "anonymous";
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = src;
    });
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    const words = text.split(/\s+/);
    const lines = [];
    let line = "";

    for (const word of words) {
        const test = line ? line + " " + word : word;

        if (ctx.measureText(test).width > maxWidth && line) {
            lines.push(line);
            line = word;
        } else {
            line = test;
        }
    }

    if (line) lines.push(line);

    lines.slice(0, maxLines).forEach((value, index) => {
        if (index === maxLines - 1 && lines.length > maxLines) {
            value = value.replace(/\s+\S*$/, "") + "…";
        }

        ctx.fillText(value, x, y + index * lineHeight);
    });
}

$("download").addEventListener("click", async () => {
    $("status").textContent = "Preparing image…";

    const canvas = $("canvas");
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#0f0f0f";
    ctx.fillRect(0, 0, 1280, 920);

    try {
        const image = await loadImage(thumbnail);

        const scale = Math.max(
            1280 / image.width,
            720 / image.height
        );

        const width = image.width * scale;
        const height = image.height * scale;

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(0, 0, 1280, 720, 20);
        ctx.clip();

        ctx.drawImage(
            image,
            (1280 - width) / 2,
            (720 - height) / 2,
            width,
            height
        );

        ctx.restore();

        const avatarImage = await loadImage(avatar).catch(() => null);

        if (avatarImage) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(52, 790, 34, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(avatarImage, 18, 756, 68, 68);
            ctx.restore();
        }

        const title = $("title").value.trim() || "Your video title";
        const channel = $("channel").value.trim() || "Channel name";
        const views = $("views").value.trim() || "Views · upload date";

        ctx.fillStyle = "#f1f1f1";
        ctx.font = "600 34px Arial";
        wrapText(ctx, title, 112, 772, 1080, 43, 2);

        ctx.fillStyle = "#aaa";
        ctx.font = "24px Arial";
        ctx.fillText(channel, 112, 858);
        ctx.fillText(views, 112, 895);

        ctx.fillStyle = "#ddd";
        ctx.font = "36px Arial";
        ctx.fillText("⋮", 1220, 780);

        const link = document.createElement("a");
        link.download = "youtube-listing.png";
        link.href = canvas.toDataURL("image/png");
        link.click();

        $("status").textContent = "Image downloaded.";
    } catch {
        $("status").textContent =
            "Couldn't export. Try uploading the thumbnail image directly.";
    }
});

refresh();
