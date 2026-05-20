"use client";

import { useState, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Search, BookOpen, Plus, Trash2, Upload, FileText } from "lucide-react";
import { cn, truncate } from "@/lib/utils";

interface KnowledgeDoc {
  id: string;
  title: string;
  content: string;
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
}

interface SearchResult {
  documentTitle: string;
  chunk: string;
  score: number;
}

export function KnowledgePanel() {
  const [documents, setDocuments] = useState<KnowledgeDoc[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const [activeTab, setActiveTab] = useState<"docs" | "search">("docs");

  const fetchDocuments = async () => {
    try {
      const res = await fetch("/api/knowledge/documents");
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
      }
    } catch (error) {
      console.error("Failed to fetch documents:", error);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleAdd = async () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    setIsAdding(true);
    try {
      const res = await fetch("/api/knowledge/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim(), content: newContent.trim() }),
      });
      if (res.ok) {
        toast.success(`Document "${newTitle}" added with chunks`);
        setAddDialogOpen(false);
        setNewTitle("");
        setNewContent("");
        fetchDocuments();
      } else {
        toast.error("Failed to add document");
      }
    } catch (error) {
      console.error("Failed to add document:", error);
      toast.error("Failed to add document");
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/knowledge/documents/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Document deleted");
        fetchDocuments();
        setSearchResults([]);
      } else {
        toast.error("Failed to delete document");
      }
    } catch (error) {
      console.error("Failed to delete document:", error);
      toast.error("Failed to delete document");
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await fetch("/api/knowledge/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery.trim(), topK: 10 }),
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
        setActiveTab("search");
      } else {
        toast.error("Search failed");
      }
    } catch (error) {
      console.error("Search failed:", error);
      toast.error("Search failed");
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="flex flex-col h-full space-y-3">
      <div className="flex items-center gap-1.5">
        <Button
          variant={activeTab === "docs" ? "default" : "outline"}
          size="sm"
          className="flex-1 h-8 text-xs"
          onClick={() => setActiveTab("docs")}
        >
          <FileText className="h-3.5 w-3.5 mr-1" />
          Documents
        </Button>
        <Button
          variant={activeTab === "search" ? "default" : "outline"}
          size="sm"
          className="flex-1 h-8 text-xs"
          onClick={() => setActiveTab("search")}
        >
          <Search className="h-3.5 w-3.5 mr-1" />
          Search
        </Button>
      </div>

      <Button
        variant="outline"
        className="w-full justify-start gap-2 h-10 text-sm"
        onClick={() => setAddDialogOpen(true)}
      >
        <Plus className="h-4 w-4" />
        Add Document
      </Button>

      {activeTab === "search" && (
        <div className="flex items-center gap-1.5">
          <Input
            placeholder="Search knowledge base..."
            className="h-8 text-xs bg-background/50 flex-1"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
          />
          <Button
            size="sm"
            className="h-8 px-3 text-xs"
            onClick={handleSearch}
            disabled={isSearching || !searchQuery.trim()}
          >
            {isSearching ? "..." : "Search"}
          </Button>
        </div>
      )}

      <ScrollArea className="h-[calc(100vh-280px)] pr-1">
        {activeTab === "docs" && (
          <div className="space-y-1">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="group flex flex-col gap-1 px-2.5 py-2 rounded-lg text-sm hover:bg-accent/50 text-muted-foreground transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{doc.title}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {doc.chunkCount} chunk{doc.chunkCount !== 1 ? "s" : ""} · {truncate(doc.content, 80)}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7 border-muted-foreground/30 text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50 opacity-0 group-hover:opacity-100 shrink-0 ml-2"
                    title="Delete"
                    onClick={() => handleDelete(doc.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
            {documents.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <BookOpen className="h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-xs text-muted-foreground">No documents in knowledge base</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "search" && (
          <div className="space-y-2">
            {searchResults.length > 0 && (
              <p className="text-[10px] text-muted-foreground px-1">
                {searchResults.length} result{searchResults.length !== 1 ? "s" : ""}
              </p>
            )}
            {searchResults.map((result, idx) => (
              <div
                key={idx}
                className="flex flex-col gap-1 px-2.5 py-2 rounded-lg text-sm bg-accent/20 border border-border/50"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-primary truncate">
                    {result.documentTitle}
                  </span>
                  <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                    {(result.score * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {truncate(result.chunk, 200)}
                </p>
              </div>
            ))}
            {searchResults.length === 0 && searchQuery && !isSearching && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Search className="h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-xs text-muted-foreground">No results found</p>
              </div>
            )}
            {!searchQuery && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Search className="h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-xs text-muted-foreground">Search your knowledge base</p>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {addDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-lg shadow-lg w-full max-w-lg mx-4 p-6 space-y-4">
            <h2 className="text-lg font-semibold">Add Document</h2>
            <p className="text-sm text-muted-foreground">
              Upload a document to the knowledge base for semantic search.
            </p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Title</label>
                <Input
                  placeholder="Document title..."
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Content</label>
                <Textarea
                  placeholder="Paste or type document content..."
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className="min-h-[150px] resize-y"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={!newTitle.trim() || !newContent.trim() || isAdding}
                onClick={handleAdd}
              >
                {isAdding ? "Uploading..." : "Upload"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
