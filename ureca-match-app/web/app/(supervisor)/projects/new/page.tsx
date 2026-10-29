"use client";
import Link from "next/link";
import { PageTitle } from "@/components/shell/app-shell";
import { I } from "@/components/shell/icons";
import { CycleTimeline } from "@/components/student/cycle-timeline";
import { ListingForm } from "@/components/supervisor/listing-form";
export default function NewProject() {
  return (<><Link href="/projects" className="mb-3 inline-flex items-center gap-1 text-[13.5px] font-medium"><I.ChevronLeft /> Back to my projects</Link><PageTitle title="New project" right={<CycleTimeline />} /><ListingForm /></>);
}
