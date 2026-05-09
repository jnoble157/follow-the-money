import { formatMoney } from "@/lib/formatMoney";
import type { GraphNodeKind } from "@/lib/investigations/types";
import type {
  DonorRecipient,
  DonorWithStats,
  OfficialDetail,
  OfficialDonorLink,
  ProfileNetwork,
} from "./types";

export function officialDonorGraph(official: OfficialDetail): ProfileNetwork {
  if (official.topOrganizationDonors.length === 0) {
    return emptyGraph();
  }

  const officialId = `official:${official.slug}`;
  const nodes: ProfileNetwork["nodes"] = [
    {
      id: officialId,
      label: official.name,
      kind: "filer" as const,
      sublabel: official.role,
      profileSlug: official.slug,
    },
  ];
  const edges: ProfileNetwork["edges"] = [];

  official.topOrganizationDonors.forEach((donor, i) => {
    const donorId = donorNodeId(donor, i);
    nodes.push({
      id: donorId,
      label: donor.displayName,
      kind: "donor" as const,
      sublabel: contributionText(donor.contributionCount),
      href: donor.donorSlug ? `/donor/${donor.donorSlug}` : undefined,
      hrefLabel: donor.donorSlug ? "Open donor" : undefined,
    });
    edges.push({
      from: donorId,
      to: officialId,
      label: formatMoney(donor.total, { compact: true }),
      weight: donor.total,
      citation: donor.source,
    });
  });

  return { nodes, edges };
}

export function donorRecipientGraph(donor: DonorWithStats): ProfileNetwork {
  if (donor.topRecipients.length === 0) {
    return emptyGraph();
  }

  const donorId = `donor:${donor.slug}`;
  const nodes: ProfileNetwork["nodes"] = [
    {
      id: donorId,
      label: donor.displayName,
      kind: "donor" as const,
      sublabel: contributionText(donor.contributionCount),
      href: `/donor/${donor.slug}`,
      hrefLabel: "Open donor",
    },
  ];
  const edges: ProfileNetwork["edges"] = [];

  donor.topRecipients.forEach((recipient, i) => {
    const recipientId = recipientNodeId(recipient, i);
    nodes.push({
      id: recipientId,
      label: recipient.recipient,
      kind: recipientNodeKind(recipient),
      sublabel: recipient.recipientRole,
      profileSlug: recipient.recipientSlug,
    });
    edges.push({
      from: donorId,
      to: recipientId,
      label: formatMoney(recipient.total, { compact: true }),
      weight: recipient.total,
      citation: recipient.source,
    });
  });

  return { nodes, edges };
}

function emptyGraph(): ProfileNetwork {
  return { nodes: [], edges: [] };
}

function donorNodeId(donor: OfficialDonorLink, i: number): string {
  return donor.donorSlug
    ? `donor:${donor.donorSlug}`
    : `donor:${stableKey(donor.displayName)}:${i}`;
}

function recipientNodeId(recipient: DonorRecipient, i: number): string {
  return recipient.recipientSlug
    ? `official:${recipient.recipientSlug}`
    : `recipient:${stableKey(recipient.recipient)}:${i}`;
}

function recipientNodeKind(recipient: DonorRecipient): GraphNodeKind {
  if (recipient.recipientSlug) return "filer";
  const filerType = recipient.recipientFilerType?.toUpperCase() ?? "";
  if (["AUSTIN", "COH", "JCOH", "SCC"].includes(filerType)) return "filer";
  return "pac";
}

function contributionText(n: number): string {
  return `${n.toLocaleString()} ${n === 1 ? "contribution" : "contributions"}`;
}

function stableKey(value: string): string {
  return (
    value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ||
    "entity"
  );
}
