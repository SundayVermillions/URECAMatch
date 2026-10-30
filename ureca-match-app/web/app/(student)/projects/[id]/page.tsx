"use client";
/** Project detail. Screen: ProjectDetailPage. REQ-BROWSE-1..3. The page itself is shared with the admin: components/project/project-detail.tsx. */
import { useParams } from "next/navigation";
import { ProjectView } from "@/components/project/project-detail";

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  return <ProjectView id={id} />;
}
