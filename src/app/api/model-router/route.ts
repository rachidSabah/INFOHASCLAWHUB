import { NextRequest, NextResponse } from "next/server";
import { routeToBestModel, detectTaskType, getTaskSpecificPromptEnhancement, MODEL_PROFILES } from "@/lib/model-router";

export async function POST(req: NextRequest) {
  try {
    const { prompt, availableModels, priority } = await req.json();
    
    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }
    
    const models = availableModels || Object.keys(MODEL_PROFILES);
    const decision = routeToBestModel(prompt, models, priority || "quality");
    const taskEnhancement = getTaskSpecificPromptEnhancement(decision.taskType);
    
    return NextResponse.json({
      ...decision,
      taskEnhancement,
    });
  } catch (error) {
    return NextResponse.json({ error: "Model routing failed" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    profiles: MODEL_PROFILES,
    taskTypes: ["coding", "debugging", "reasoning", "research", "creative", "analysis", "general"],
  });
}
