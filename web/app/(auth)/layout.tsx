import Image from "next/image";

/** Centred single panel with the NTU and URECA marks (SRS 3.1.2). */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex w-[46%] bg-navy text-white flex-col justify-between p-12">
        <Image src="/ureca-logo.png" alt="URECA" width={110} height={110} className="rounded-xl bg-white p-2" />
        <div>
          <div className="font-display text-[40px] font-extrabold leading-[1.05] tracking-tight max-w-md">Match every student with research they care about.</div>
          <div className="text-[15px] opacity-75 mt-5 max-w-md">Students rank projects. Supervisors rank applicants. One round at a time, until every slot is filled.</div>
        </div>
        <div className="text-[12px] opacity-60">Undergraduate Research Experience on Campus · Nanyang Technological University</div>
      </div>
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-[420px]">
          <Image src="/ntu-logo.png" alt="NTU" width={150} height={54} className="mx-auto mb-8" priority />
          {children}
        </div>
      </div>
    </div>
  );
}
