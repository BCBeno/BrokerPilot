import { BIntro } from "@/components/wizard/b-intro";

export default async function BEntry({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <BIntro token={token} />;
}
