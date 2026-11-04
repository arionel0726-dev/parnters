import { PartnerProfile } from "@/features/partners/partner-profile"

export const dynamic = "force-dynamic"

export default async function PartnerProfileRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <PartnerProfile id={id} />
}

