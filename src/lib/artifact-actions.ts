export async function handleDownloadMessage(content: string, title: string) {
  const payload = {
    type: "docx" as const,
    data: { title: title || "AI Response", sections: [{ heading: "Response", body: content.slice(0, 30000) }] },
    filename: `${(title || "response").replace(/[^a-zA-Z0-9]/g, "_")}.docx`,
  };

  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = payload.filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch {}
}
