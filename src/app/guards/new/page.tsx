"use client";

import { useRouter } from "next/navigation";
import GuardEditor from "@/components/GuardEditor";

export default function NewGuardPage() {
  const router = useRouter();
  // Cache Components 会保留页面状态；每次从入口新建时使用全新的表单。
  return <GuardEditor key={router.bfcacheId} />;
}
