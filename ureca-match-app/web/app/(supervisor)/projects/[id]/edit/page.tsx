"use client";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/shell/app-shell";
import { ListingForm } from "@/components/supervisor/listing-form";
import { Loading } from "@/components/ui";
import { useApi } from "@/lib/use-api";
export default function EditProject() {
  const { id } = useParams<{ id: string }>();
  const { data } = useApi((api) => api.listing(id), [id]);
  if (!data) return <Loading />;
  return (<><PageHeader title="Edit project" back={{ href: "/projects", label: "Back to my projects" }} description={data.title} /><ListingForm existing={data} /></>);
}
