import httpx
from typing import List, Dict, Any, Optional
from datetime import datetime
from app.core.config import get_settings


class ProPublicaService:
    """Service for fetching data from ProPublica API"""
    
    def __init__(self):
        self.settings = get_settings()
        self.api_key = self.settings.PROPUBLICA_API_KEY
        self.headers = {
            "X-ProPublica-API-Key": self.api_key
        }
        self.base_url = "https://api.propublica.gov/congress/v1"
    
    async def get_current_congress_members(self) -> List[Dict[str, Any]]:
        """Fetch current congress members"""
        async with httpx.AsyncClient(headers=self.headers) as client:
            response = await client.get(f"{self.base_url}/members/legislators")
            response.raise_for_status()
            data = response.json()
        
        members = []
        for member in data.get("results", [{}])[0].get("legislators", []):
            member_data = {
                "member_id": member.get("id"),
                "first_name": member.get("first_name"),
                "last_name": member.get("last_name"),
                "party": member.get("party"),
                "state": member.get("state"),
                "chamber": member.get("chamber"),
                "office": member.get("office"),
                "source_url": member.get("url")
            }
            members.append(member_data)
        
        return members
    
    async def get_member_votes(self, member_id: str) -> List[Dict[str, Any]]:
        """Fetch voting record for a specific member"""
        async with httpx.AsyncClient(headers=self.headers) as client:
            response = await client.get(f"{self.base_url}/members/{member_id}/votes")
            response.raise_for_status()
            data = response.json()
        
        votes = []
        for vote in data.get("results", [{}])[0].get("votes", []):
            vote_data = {
                "vote_id": vote.get("id"),
                "date": datetime.fromisoformat(vote.get("date").replace("Z", "+00:00")) if vote.get("date") else None,
                "bill_id": vote.get("bill_id"),
                "bill_number": vote.get("bill_number"),
                "description": vote.get("description"),
                "result": vote.get("result"),
                "source_url": vote.get("url")
            }
            votes.append(vote_data)
        
        return votes
    
    async def get_legislation(self, congress: int = 118, 
                            status: Optional[str] = None) -> List[Dict[str, Any]]:
        """Fetch legislation for a specific congress"""
        params = {
            "congress": congress
        }
        if status:
            params["status"] = status
        
        async with httpx.AsyncClient(headers=self.headers) as client:
            response = await client.get(f"{self.base_url}/legislation/{congress}", params=params)
            response.raise_for_status()
            data = response.json()
        
        legislation = []
        for bill in data.get("results", [{}])[0].get("legislation", []):
            bill_data = {
                "bill_id": bill.get("id"),
                "bill_number": bill.get("number"),
                "title": bill.get("title"),
                "introduced_date": datetime.fromisoformat(bill.get("introduced").replace("Z", "+00:00")) if bill.get("introduced") else None,
                "status": bill.get("status"),
                "source_url": bill.get("url"),
                "congress": congress
            }
            legislation.append(bill_data)
        
        return legislation
