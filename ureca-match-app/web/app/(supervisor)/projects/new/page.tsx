"use client";
import { PageHeader } from "@/components/shell/app-shell";
import { ListingForm } from "@/components/supervisor/listing-form";
export default function NewProject() {
  return (<><PageHeader title="New project" back={{ href: "/projects", label: "Back to my projects" }} description="Describe the project, then publish it for students or save a draft to finish later." /><ListingForm /></>);
}
