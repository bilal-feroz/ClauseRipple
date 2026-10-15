"""Deterministic compliance rules. The LLM never decides compliance; these functions do.

violating_regions = actual_processing_regions - allowed_customer_regions
affected          = dependency_path_exists AND violating_regions != {}
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Literal

Status = Literal["IMPACTED", "ALLOWED", "NO_DEPENDENCY", "NO_RESIDENCY_OBLIGATION"]
Severity = Literal["CRITICAL", "HIGH", "NONE"]


@dataclass(frozen=True)
class ResidencyVerdict:
    customer_id: str
    customer_name: str
    status: Status
    affected: bool
    severity: Severity
    dependency_path_exists: bool
    vendor_regions: list[str]
    allowed_regions: list[str]
    violating_regions: list[str]
    introduced_by_change: list[str]
    reason: str
    regulated: bool = False
    routes: list[dict] = field(default_factory=list)

    def as_dict(self) -> dict:
        return asdict(self)


def violating_regions(actual: set[str] | list[str], allowed: set[str] | list[str]) -> list[str]:
    return sorted(set(actual) - set(allowed))


def severity_for(affected: bool, regulated: bool) -> Severity:
    if not affected:
        return "NONE"
    return "CRITICAL" if regulated else "HIGH"


def classify_residency(
    *,
    customer_id: str,
    customer_name: str,
    vendor_name: str,
    dependency_path_exists: bool,
    vendor_regions: list[str],
    allowed_regions: list[str],
    regulated: bool,
    clause_refs: list[str] | None = None,
    added_regions: list[str] | None = None,
    routes: list[dict] | None = None,
) -> ResidencyVerdict:
    allowed = sorted(set(allowed_regions))
    actual = sorted(set(vendor_regions))
    refs = ", ".join(f"§{r}" for r in (clause_refs or [])) or "its contract"
    common = {
        "customer_id": customer_id,
        "customer_name": customer_name,
        "dependency_path_exists": dependency_path_exists,
        "vendor_regions": actual if dependency_path_exists else [],
        "allowed_regions": allowed,
        "regulated": regulated,
        "routes": routes or [],
    }
    if not dependency_path_exists:
        return ResidencyVerdict(
            **common,
            status="NO_DEPENDENCY",
            affected=False,
            severity="NONE",
            violating_regions=[],
            introduced_by_change=[],
            reason=f"No dependency path from {customer_name} to {vendor_name} "
            "(bounded search over USES/POWERED_BY/DEPENDS_ON, up to 6 hops).",
        )
    if not allowed:
        return ResidencyVerdict(
            **common,
            status="NO_RESIDENCY_OBLIGATION",
            affected=False,
            severity="NONE",
            violating_regions=[],
            introduced_by_change=[],
            reason=f"{customer_name} has no data-residency obligation in the graph.",
        )
    bad = violating_regions(actual, allowed)
    if bad:
        introduced = sorted(set(bad) & set(added_regions or []))
        return ResidencyVerdict(
            **common,
            status="IMPACTED",
            affected=True,
            severity=severity_for(True, regulated),
            violating_regions=bad,
            introduced_by_change=introduced,
            reason=f"{vendor_name} may now process in {', '.join(bad)}; {customer_name} {refs} "
            f"allows only {', '.join(allowed)}.",
        )
    return ResidencyVerdict(
        **common,
        status="ALLOWED",
        affected=False,
        severity="NONE",
        violating_regions=[],
        introduced_by_change=[],
        reason=f"Every {vendor_name} region ({', '.join(actual)}) is permitted by {customer_name} {refs}.",
    )
