import { NextResponse } from "next/server";
import { pipelineStore } from "@/lib/pipeline-store";

export async function GET() {
  try {
    const prebuiltPipelines = [
      {
        name: "Multi-Stage ATS Resume Analyzer",
        description: "Scrapes a job URL, analyzes a resume against the description, generates a tailored cover letter and follow-up email draft.",
        steps: JSON.stringify([
          { name: "Scrape Job Page", agent: "Scraper7b", status: "pending", prompt: "Extract job title, requirements, and company info from the URL." },
          { name: "Parse Resume", agent: "Parser7b", status: "pending", prompt: "Extract skills, experience, and education from the uploaded PDF." },
          { name: "Match & Score", agent: "Matcher7b", status: "pending", prompt: "Compare resume to job requirements and generate a compatibility score." },
          { name: "Generate Cover Letter", agent: "Writer7b", status: "pending", prompt: "Write a tailored cover letter based on the match analysis." },
          { name: "Generate Follow-Up Email", agent: "Writer7b", status: "pending", prompt: "Draft a professional follow-up email for the candidate to send." },
        ]),
        status: "draft",
        currentStep: 0,
      },
      {
        name: "Code Review & Optimization Pipeline",
        description: "Reviews code for bugs, security issues, performance bottlenecks, and suggests refactoring.",
        steps: JSON.stringify([
          { name: "Static Analysis", agent: "Analyzer7b", status: "pending", prompt: "Run comprehensive static code analysis for potential issues." },
          { name: "Security Audit", agent: "Security7b", status: "pending", prompt: "Identify security vulnerabilities and suggest fixes." },
          { name: "Performance Review", agent: "Perf7b", status: "pending", prompt: "Analyze code for performance bottlenecks and optimization opportunities." },
          { name: "Refactoring Suggestions", agent: "Refactor7b", status: "pending", prompt: "Propose refactoring changes to improve code quality and maintainability." },
        ]),
        status: "draft",
        currentStep: 0,
      },
      {
        name: "Documentation Generator",
        description: "Reads source code and generates comprehensive documentation, API references, and README files.",
        steps: JSON.stringify([
          { name: "Code Understanding", agent: "Reader7b", status: "pending", prompt: "Analyze the codebase structure and understand the architecture." },
          { name: "API Documentation", agent: "DocWriter7b", status: "pending", prompt: "Generate API documentation for all public methods and endpoints." },
          { name: "README Generation", agent: "DocWriter7b", status: "pending", prompt: "Create a comprehensive README with setup instructions and examples." },
          { name: "Inline Docs", agent: "DocWriter7b", status: "pending", prompt: "Add JSDoc/TSDoc comments to the codebase." },
        ]),
        status: "draft",
        currentStep: 0,
      },
      {
        name: "Data Pipeline - CSV to Analytics Dashboard",
        description: "Ingests CSV data, validates, transforms, aggregates, and generates a dashboard-ready JSON.",
        steps: JSON.stringify([
          { name: "CSV Ingestion", agent: "DataLoader7b", status: "pending", prompt: "Load and parse the CSV file, validate structure." },
          { name: "Data Validation", agent: "Validator7b", status: "pending", prompt: "Check data integrity, handle missing values, validate types." },
          { name: "Transformation", agent: "Transformer7b", status: "pending", prompt: "Transform and normalize the data for analysis." },
          { name: "Aggregation", agent: "Aggregator7b", status: "pending", prompt: "Aggregate data based on the required dimensions." },
          { name: "Export to JSON", agent: "Exporter7b", status: "pending", prompt: "Export the processed data as a dashboard-ready JSON format." },
        ]),
        status: "draft",
        currentStep: 0,
      },
      {
        name: "Multi-Source News Aggregator",
        description: "Fetches news from multiple RSS feeds, classifies articles by topic, summarizes key points.",
        steps: JSON.stringify([
          { name: "Fetch RSS Feeds", agent: "Fetcher7b", status: "pending", prompt: "Fetch articles from the configured RSS feed URLs." },
          { name: "Deduplicate", agent: "Dedup7b", status: "pending", prompt: "Remove duplicate and near-duplicate articles across sources." },
          { name: "Topic Classification", agent: "Classifier7b", status: "pending", prompt: "Classify each article into predefined topic categories." },
          { name: "Summarization", agent: "Summarizer7b", status: "pending", prompt: "Generate concise summaries for each article." },
          { name: "Build Digest", agent: "Digest7b", status: "pending", prompt: "Compile the top articles into a daily digest format." },
        ]),
        status: "draft",
        currentStep: 0,
      },
      {
        name: "Multi-Model Consensus Checker",
        description: "Sends the same prompt to multiple LLMs, compares outputs, and generates a consensus report.",
        steps: JSON.stringify([
          { name: "Multi-Provider Request", agent: "Orchestrator7b", status: "pending", prompt: "Send the query to all configured providers simultaneously." },
          { name: "Response Collection", agent: "Collector7b", status: "pending", prompt: "Collect and normalize responses from all providers." },
          { name: "Diff Analysis", agent: "Analyzer7b", status: "pending", prompt: "Compare responses and identify agreements and disagreements." },
          { name: "Consensus Report", agent: "Reporter7b", status: "pending", prompt: "Generate a comprehensive consensus report with majority and minority views." },
        ]),
        status: "draft",
        currentStep: 0,
      },
    ];

    for (const p of prebuiltPipelines) {
      const id = crypto.randomUUID();
      pipelineStore.set(id, {
        id,
        ...p,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      message: `Seeded ${prebuiltPipelines.length} prebuilt pipelines successfully`,
      pipelines: prebuiltPipelines.length,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
