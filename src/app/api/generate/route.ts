import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { type, data, filename } = await req.json();

    if (!type || !data) {
      return NextResponse.json({ error: "type and data are required" }, { status: 400 });
    }

    let buffer: Buffer;
    let mimeType: string;
    let ext: string;

    switch (type) {
      case "docx":
        ({ buffer, mimeType, ext } = await generateDOCX(data));
        break;
      case "pdf":
        ({ buffer, mimeType, ext } = await generatePDF(data));
        break;
      case "xlsx":
        ({ buffer, mimeType, ext } = await generateXLSX(data));
        break;
      case "pptx":
        ({ buffer, mimeType, ext } = await generatePPTX(data));
        break;
      case "csv":
        ({ buffer, mimeType, ext } = generateCSV(data));
        break;
      case "md":
        ({ buffer, mimeType, ext } = generateMD(data));
        break;
      case "html":
        ({ buffer, mimeType, ext } = generateHTML(data));
        break;
      default:
        return NextResponse.json({ error: `Unsupported type: ${type}` }, { status: 400 });
    }

    const name = filename || `document-${Date.now()}.${ext}`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${name}"`,
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Generation failed" },
      { status: 500 }
    );
  }
}

async function generateDOCX(data: {
  title?: string;
  author?: string;
  sections?: Array<{
    heading: string;
    body: string;
    bulletPoints?: string[];
  }>;
  content?: string;
}) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, TableOfContents, Table, TableRow, TableCell, BorderStyle } = require("docx");

  const children: any[] = [];

  if (data.title) {
    children.push(
      new Paragraph({
        text: data.title,
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      })
    );
  }

  if (data.author) {
    children.push(
      new Paragraph({
        text: `Author: ${data.author}`,
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
      })
    );
  }

  if (data.sections) {
    for (const section of data.sections) {
      children.push(
        new Paragraph({
          text: section.heading,
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 300, after: 100 },
        })
      );
      children.push(
        new Paragraph({
          text: section.body,
          spacing: { after: 100 },
        })
      );
      if (section.bulletPoints) {
        for (const point of section.bulletPoints) {
          children.push(
            new Paragraph({
              text: `• ${point}`,
              bullet: { level: 0 },
              spacing: { after: 50 },
            })
          );
        }
      }
    }
  } else if (data.content) {
    const paragraphs = data.content.split("\n");
    for (const p of paragraphs) {
      if (p.trim()) {
        children.push(
          new Paragraph({
            text: p.trim(),
            spacing: { after: 100 },
          })
        );
      }
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });

  const buffer = await Packer.toBuffer(doc);
  return { buffer: Buffer.from(buffer), mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx" };
}

async function generatePDF(data: {
  title?: string;
  content?: string;
  sections?: Array<{ heading: string; body: string }>;
}) {
  const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page = pdfDoc.addPage([612, 792]);
  let y = 750;

  const addText = (text: string, size: number, isBold: boolean, color = rgb(0, 0, 0)) => {
    page.drawText(text.slice(0, 120), { x: 50, y, size, font: isBold ? fontBold : font, color });
    y -= size + 6;
    if (y < 50) { page = pdfDoc.addPage([612, 792]); y = 750; }
  };

  if (data.title) {
    addText(data.title, 22, true);
    y -= 10;
  }

  if (data.sections) {
    for (const section of data.sections) {
      addText(section.heading, 16, true, rgb(0, 0.3, 0.6));
      addText(section.body, 11, false);
      y -= 5;
    }
  } else if (data.content) {
    const lines = data.content.split("\n");
    for (const line of lines) {
      if (line.trim()) {
        addText(line.trim(), 11, false);
      }
    }
  }

  const pdfBytes = await pdfDoc.save();
  return { buffer: Buffer.from(pdfBytes), mimeType: "application/pdf", ext: "pdf" };
}

async function generateXLSX(data: {
  sheets?: Array<{ name: string; headers: string[]; rows: any[][] }>;
  title?: string;
  data?: any[][];
}) {
  const ExcelJS = require("exceljs");
  const workbook = new ExcelJS.Workbook();

  if (data.sheets) {
    for (const sheetData of data.sheets) {
      const sheet = workbook.addWorksheet(sheetData.name || "Sheet1");
      if (sheetData.headers) {
        const headerRow = sheet.addRow(sheetData.headers);
        headerRow.font = { bold: true };
        headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
        headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      }
      for (const row of sheetData.rows) {
        sheet.addRow(row);
      }
      sheet.columns.forEach((col: any) => { col.width = 18; });
    }
  } else if (data.data) {
    const sheet = workbook.addWorksheet(data.title || "Data");
    for (const row of data.data) {
      sheet.addRow(row);
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return { buffer: Buffer.from(buffer), mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" };
}

async function generatePPTX(data: {
  title?: string;
  slides?: Array<{ title: string; content: string[]; image?: string }>;
  content?: string;
}) {
  const PptxGenJS = require("pptxgenjs");
  const pptx = new PptxGenJS();

  if (data.slides) {
    for (const slide of data.slides) {
      const s = pptx.addSlide();
      s.addText(slide.title, { x: 0.5, y: 0.3, w: "90%", fontSize: 28, bold: true, color: "363636" });
      if (slide.content && slide.content.length > 0) {
        s.addText(slide.content.map((c: string) => ({ text: c, options: { bullet: true, fontSize: 16, color: "555555", breakType: "none" as any } })), { x: 0.5, y: 1.5, w: "90%", h: 4 });
      }
    }
  } else {
    const s = pptx.addSlide();
    s.addText(data.title || "Presentation", { x: 0.5, y: 0.3, w: "90%", fontSize: 32, bold: true, color: "2D3748" });
    if (data.content) {
      const lines = data.content.split("\n").filter(Boolean);
      s.addText(lines.map((l: string) => ({ text: l, options: { bullet: true, fontSize: 16, color: "4A5568" } })), { x: 0.5, y: 1.8, w: "90%" });
    }
  }

  const buffer = await pptx.write({ outputType: "nodebuffer" }) as Buffer;
  return { buffer, mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", ext: "pptx" };
}

function generateCSV(data: { content?: string; rows?: any[][] }) {
  let csv = "";
  if (data.rows) {
    for (const row of data.rows) {
      csv += row.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(",") + "\n";
    }
  } else if (data.content) {
    csv = data.content;
  }
  return { buffer: Buffer.from(csv, "utf-8"), mimeType: "text/csv", ext: "csv" };
}

function generateMD(data: { content?: string }) {
  const md = data.content || "# Document\n\nEmpty document.";
  return { buffer: Buffer.from(md, "utf-8"), mimeType: "text/markdown", ext: "md" };
}

function generateHTML(data: { content?: string; title?: string }) {
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${data.title || "Document"}</title><style>body{font-family:system-ui,sans-serif;max-width:800px;margin:2rem auto;padding:0 1rem;line-height:1.6;color:#1a1a1a}pre{background:#f5f5f5;padding:1rem;border-radius:8px;overflow-x:auto}</style></head><body>${data.content || "<h1>Document</h1>"}</body></html>`;
  return { buffer: Buffer.from(html, "utf-8"), mimeType: "text/html", ext: "html" };
}
