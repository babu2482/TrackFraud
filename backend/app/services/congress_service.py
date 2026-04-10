import httpx
from typing import List, Dict, Any, Optional
from datetime import datetime
from app.core.config import get_settings


class CongressGovService:
    """Service for fetching congressional data from Congress.gov"""
    
    def __init__(self):
        self.settings = get_settings()
        self.api_key = self.settings.CONGRESS_API_KEY
        self.base_url = "https://api.congress.gov/v3"
    
    async def get_bills(self, congress: Optional[int] = None, 
                        bill_type: Optional[str] = None,
                        status: Optional[str] = None) -> List[Dict[str, Any]]:
        """Fetch bills from Congress.gov"""
        params = {
            "apiKey": self.api_key,
            "format": "json"
        }
        
        if congress:
            params["congress"] = congress
        if bill_type:
            params["type"] = bill_type
        if status:
            params["status"] = status
        
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{self.base_url}/legislation", params=params)
            response.raise_for_status()
            data = response.json()
        
        bills = []
        for bill in data.get("legislation", []):
            bill_data = {
                "external_id": str(bill.get("congressionalId")),
                "bill_number": bill.get("number"),
                "bill_type": bill.get("type"),
                "title": bill.get("title"),
                "summary": bill.get("summary"),
                "introduced_date": datetime.fromisoformat(bill.get("introduced").replace("Z", "+00:00")) if bill.get("introduced") else None,
                "status": bill.get("status"),
                "source_url": f"https://www.congress.gov/bill/{bill.get('congress')}/{bill.get('type')}/{bill.get('number')}",
                "congress_number": bill.get("congress")
            }
            bills.append(bill_data)
        
        return bills
    
    async def get_bill_votes(self, bill_id: str) -> List[Dict[str, Any]]:
        """Fetch vote records for a specific bill"""
        params = {
            "apiKey": self.api_key,
            "format": "json",
            "billId": bill_id
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{self.base_url}/votes", params=params)
            response.raise_for_status()
            data = response.json()
        
        votes = []
        for vote in data.get("votes", []):
            vote_data = {
                "vote_type": vote.get("type"),
                "vote_date": datetime.fromisoformat(vote.get("date").replace("Z", "+00:00")) if vote.get("date") else None,
                "result": vote.get("result"),
                "yeas": vote.get("yeas"),
                "nays": vote.get("nays"),
                "source_url": vote.get("url")
            }
            votes.append(vote_data)
        
        return votes
    
    async def get_congress_members(self, chamber: Optional[str] = None) -> List[Dict[str, Any]]:
        """Fetch list of current congress members"""
        params = {
            "apiKey": self.api_key,
            "format": "json"
        }
        
        if chamber:
            params["chamber"] = chamber
        
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{self.base_url}/members", params=params)
            response.raise_for_status()
            data = response.json()
        
        members = []
        for member in data.get("members", []):
            member_data = {
                "member_id": str(member.get("id")),
                "first_name": member.get("firstName"),
                "last_name": member.get("lastName"),
                "party": member.get("party"),
                "state": member.get("state"),
                "chamber": member.get("chamber"),
                "office": member.get("office"),
                "source_url": member.get("url")
            }
            members.append(member_data)
        
        return members
