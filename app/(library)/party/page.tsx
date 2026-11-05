import { PartyScreen } from "@/components/tv/party-screen";

export const metadata = { title: "Ver juntos" };

export default function PartyPage({ searchParams }: { searchParams: { code?: string } }) {
  return <PartyScreen initialCode={searchParams.code} />;
}
