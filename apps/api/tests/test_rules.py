from app.services.rules import classify_residency, severity_for, triage_order, violating_regions


def verdict(**kw):
    base = {
        "customer_id": "customer:x",
        "customer_name": "X",
        "vendor_name": "ModelCloud",
        "dependency_path_exists": True,
        "vendor_regions": ["UAE", "EU", "US"],
        "allowed_regions": ["UAE", "EU"],
        "regulated": True,
        "clause_refs": ["7.2"],
        "added_regions": ["US"],
    }
    base.update(kw)
    return classify_residency(**base)


def test_violating_regions_is_set_difference():
    assert violating_regions({"UAE", "EU", "US"}, {"UAE", "EU"}) == ["US"]
    assert violating_regions(["UAE"], ["UAE", "EU", "US"]) == []


def test_falcon_bank_is_impacted_when_us_added():
    v = verdict(customer_name="Falcon Bank")
    assert v.affected and v.status == "IMPACTED"
    assert v.violating_regions == ["US"]
    assert v.introduced_by_change == ["US"]
    assert v.severity == "CRITICAL"
    assert "§7.2" in v.reason


def test_nova_retail_allows_us():
    v = verdict(customer_name="Nova Retail", allowed_regions=["UAE", "EU", "US"], regulated=False)
    assert not v.affected and v.status == "ALLOWED" and v.severity == "NONE"


def test_gulfgov_without_dependency_path_is_not_impacted_even_if_regions_conflict():
    v = verdict(customer_name="GulfGov", allowed_regions=["UAE"], dependency_path_exists=False)
    assert not v.affected and v.status == "NO_DEPENDENCY"
    assert v.vendor_regions == []  # vendor regions are irrelevant without a path


def test_no_residency_obligation():
    v = verdict(allowed_regions=[])
    assert not v.affected and v.status == "NO_RESIDENCY_OBLIGATION"


def test_severity_depends_on_regulation():
    assert severity_for(True, True) == "CRITICAL"
    assert severity_for(True, False) == "HIGH"
    assert severity_for(False, True) == "NONE"


def test_triage_orders_impacted_then_severity_then_contract_value():
    a = verdict(customer_name="Acme", acv_usd=640_000)
    f = verdict(customer_name="Falcon", acv_usd=1_250_000)
    h = verdict(customer_name="Hi", regulated=False, acv_usd=9_000_000)
    n = verdict(customer_name="Nova", allowed_regions=["UAE", "EU", "US"], acv_usd=10_000_000)
    assert [v.customer_name for v in triage_order([n, a, h, f])] == ["Falcon", "Acme", "Hi", "Nova"]
