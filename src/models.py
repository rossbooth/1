"""
Data models for Franchise Disclosure Document (FDD) information
"""

from dataclasses import dataclass, field
from typing import Optional, List, Dict
from datetime import datetime


@dataclass
class FranchiseFinancials:
    """Financial data from Item 7 of FDD"""
    initial_franchise_fee: Optional[float] = None
    initial_investment_low: Optional[float] = None
    initial_investment_high: Optional[float] = None
    royalty_fee_percentage: Optional[float] = None
    advertising_fee_percentage: Optional[float] = None
    additional_fees: Dict[str, float] = field(default_factory=dict)


@dataclass
class FranchisePerformance:
    """Financial performance data from Item 19 of FDD"""
    has_item_19: bool = False
    avg_gross_sales: Optional[float] = None
    median_gross_sales: Optional[float] = None
    avg_net_income: Optional[float] = None
    median_net_income: Optional[float] = None
    sample_size: Optional[int] = None
    year: Optional[int] = None
    notes: str = ""


@dataclass
class FranchiseInfo:
    """General franchise information"""
    franchise_name: str
    franchisor_name: str
    industry: Optional[str] = None
    date_filed: Optional[datetime] = None
    effective_date: Optional[datetime] = None
    state_filed: Optional[str] = None

    # Contact information
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None

    # Franchise system information
    total_franchises: Optional[int] = None
    company_owned: Optional[int] = None
    franchised_outlets: Optional[int] = None
    year_founded: Optional[int] = None
    year_franchising_began: Optional[int] = None

    # Document information
    fdd_url: Optional[str] = None
    pdf_path: Optional[str] = None


@dataclass
class FranchiseData:
    """Complete franchise data extracted from FDD"""
    info: FranchiseInfo
    financials: FranchiseFinancials = field(default_factory=FranchiseFinancials)
    performance: FranchisePerformance = field(default_factory=FranchisePerformance)
    raw_text: str = ""
    extraction_date: datetime = field(default_factory=datetime.now)

    def to_dict(self) -> Dict:
        """Convert to dictionary for export"""
        return {
            'franchise_name': self.info.franchise_name,
            'franchisor_name': self.info.franchisor_name,
            'industry': self.info.industry,
            'date_filed': self.info.date_filed.isoformat() if self.info.date_filed else None,
            'effective_date': self.info.effective_date.isoformat() if self.info.effective_date else None,
            'state_filed': self.info.state_filed,
            'address': self.info.address,
            'city': self.info.city,
            'state': self.info.state,
            'zip_code': self.info.zip_code,
            'phone': self.info.phone,
            'website': self.info.website,
            'total_franchises': self.info.total_franchises,
            'company_owned': self.info.company_owned,
            'franchised_outlets': self.info.franchised_outlets,
            'year_founded': self.info.year_founded,
            'year_franchising_began': self.info.year_franchising_began,
            'initial_franchise_fee': self.financials.initial_franchise_fee,
            'initial_investment_low': self.financials.initial_investment_low,
            'initial_investment_high': self.financials.initial_investment_high,
            'royalty_fee_percentage': self.financials.royalty_fee_percentage,
            'advertising_fee_percentage': self.financials.advertising_fee_percentage,
            'has_item_19': self.performance.has_item_19,
            'avg_gross_sales': self.performance.avg_gross_sales,
            'median_gross_sales': self.performance.median_gross_sales,
            'avg_net_income': self.performance.avg_net_income,
            'median_net_income': self.performance.median_net_income,
            'performance_sample_size': self.performance.sample_size,
            'performance_year': self.performance.year,
            'fdd_url': self.info.fdd_url,
            'extraction_date': self.extraction_date.isoformat()
        }
