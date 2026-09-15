"use client";
import { PageHeader } from "@/components/shell/app-shell";
import { ListingForm } from "@/components/supervisor/listing-form";
export default function NewProject() {
  return (<><PageHeader title="New project" back={{ href: "/projects", label: "Back to my projects" }} description="Publish now or save a draft. Students see published listings immediately." /><ListingForm /></>);
}
