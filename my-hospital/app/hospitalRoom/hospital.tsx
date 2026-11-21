"use client";

import dynamic from "next/dynamic";

const Floor = dynamic(() => import("@/component/Floor/floor"), {
  ssr: false,
  loading: () => (
    <div role="status" className="grid h-full place-items-center text-slate-200">
      Đang tải trình hiển thị 3D…
    </div>
  ),
});

export default function Hospital() {
  return <Floor />;
}
