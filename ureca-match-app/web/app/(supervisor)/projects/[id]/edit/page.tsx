"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageTitle } from "@/components/shell/app-shell";
import { I } from "@/components/shell/icons";
import { ListingForm } from "@/components/supervisor/listing-form";
import { Loading } from "@/components/ui";
import { useApi } from "@/lib/use-api";
export default function EditProject() {
  const { id } = useParams<{ id: string }>();
  const { data } = useApi((api) => api.listing(id), [id]);
  if (!data) return <Loading />;
  return (<><Link href="/projects" className="mb-3 inline-flex items-center gap-1 text-[13.5px] font-medium"><I.ChevronLeft /> Back to my projects</Link><PageTitle title="Edit project" /><ListingForm existing={data} /></>);
}
