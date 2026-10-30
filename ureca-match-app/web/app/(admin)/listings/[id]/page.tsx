"use client";
/** Admin view of one project listing. Read only: no apply, edit or close. Shares the page with the student (components/project/project-detail.tsx). */
import { useParams } from "next/navigation";
import { ProjectView } from "@/components/project/project-detail";

export default function AdminProjectDetail() {
  const { id } = useParams<{ id: string }>();
  return <ProjectView id={id} admin />;
}
