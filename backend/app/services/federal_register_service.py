import httpx
from typing import List, Dict, Any, Optional
from datetime import datetime
from app.core.config import get_settings


class FederalRegisterService:
    """Service for fetching executive orders from Federal Register"""
    
    def __init__(self):
        self.settings = get_settings()
        self.base_url = "https://www.federalregister.gov/api/documents"
    
    async def get_executive_orders(self, president_name: Optional[str] = None, 
                                   start_date: Optional[datetime] = None,
                                   end_date: Optional[datetime] = None) -> List[Dict[str, Any]]:
        """Fetch executive orders from Federal Register"""
        params = {
            "document_type": "executive-orders",
            "sort": "doc_number",
            "sort_order": "desc"
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(self.base_url, params=params)
            response.raise_for_status()
            data = response.json()
            
        orders = []
        for doc in data.get("results", []):
            order = {
                "source_id": doc.get("doc_number"),
                "title": doc.get("title"),
                "date": datetime.fromisoformat(doc.get("effective_date").replace("Z", "+00:00")),
                "summary": doc.get("summary"),
                "source_url": f"https://www.federalregister.gov/documents/{doc.get('effective_date')}/{doc.get('doc_number')}",
                "document_type": "executive_order"
            }
            
            if president_name:
                # Filter by president if specified
                if president_name.lower() in order["title"].lower() or \
                   president_name.lower() in str(order["date"].year):
                    orders.append(order)
            else:
                orders.append(order)
            
            if len(orders) >= 100:  # Limit results
                break
        
        return orders
    
    async def get_all_executive_orders(self) -> List[Dict[str, Any]]:
        """Get all executive orders (1937-present)"""
        return await self.get_executive_orders()
