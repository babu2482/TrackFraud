"""
The Glass House - API Testing Script

Comprehensive test suite for validating all API endpoints.
Tests authentication, CRUD operations, and data retrieval.
"""

import asyncio
import json
import time
from typing import Optional

import httpx
from dotenv import load_dotenv

load_dotenv()


class APITestClient:
    """Test client for API validation"""

    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url
        self.session: Optional[httpx.AsyncClient] = None
        self.access_token: Optional[str] = None
        self.refresh_token: Optional[str] = None
        self.test_user_email = "testuser@theglasshouse.org"
        self.test_user_password = "TestPassword123!"
        self.results = {"passed": 0, "failed": 0, "errors": []}

    async def start(self):
        """Initialize HTTP client session"""
        self.session = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=30.0,
            headers={"Accept": "application/json", "Content-Type": "application/json"},
        )

    async def stop(self):
        """Close HTTP client session"""
        if self.session:
            await self.session.aclose()

    async def request(
        self,
        method: str,
        endpoint: str,
        data: Optional[dict] = None,
        params: Optional[dict] = None,
        auth: bool = False,
    ) -> dict:
        """
        Make HTTP request to API endpoint

        Args:
            method: HTTP method (GET, POST, PUT, DELETE)
            endpoint: API endpoint path
            data: Request body data
            params: Query parameters
            auth: Whether to include authentication header

        Returns:
            Response dictionary with status, headers, and body
        """
        headers = {}
        if auth and self.access_token:
            headers["Authorization"] = f"Bearer {self.access_token}"

        response = await self.session.request(
            method,
            endpoint,
            json=data,
            params=params,
            headers=headers,
        )

        result = {
            "status_code": response.status_code,
            "headers": dict(response.headers),
            "body": response.json() if response.content else {},
            "elapsed": response.elapsed.total_seconds(),
        }

        return result

    def print_result(self, test_name: str, passed: bool, details: str = ""):
        """Print test result with color coding"""
        status = "✓ PASS" if passed else "✗ FAIL"
        color = "\033[92m" if passed else "\033[91m"
        reset = "\033[0m"
        print(f"{color}{status}{reset}: {test_name}")
        if details:
            print(f"  {details}")

        if passed:
            self.results["passed"] += 1
        else:
            self.results["failed"] += 1
            self.results["errors"].append(f"{test_name}: {details}")


async def test_api_health(client: APITestClient):
    """Test API health endpoint"""
    print("\n=== Testing API Health ===")

    # Test root endpoint
    result = await client.request("GET", "/")
    passed = result["status_code"] == 200
    client.print_result("API Server Health", passed, f"Status: {result['status_code']}")

    # Test docs endpoint
    result = await client.request("GET", "/docs")
    passed = result["status_code"] == 200
    client.print_result(
        "API Documentation Available", passed, f"Status: {result['status_code']}"
    )


async def test_authentication(client: APITestClient):
    """Test authentication endpoints"""
    print("\n=== Testing Authentication ===")

    # Clean up: Delete existing test user if any
    try:
        await client.request("DELETE", "/api/v1/auth/account")
    except:
        pass

    # Test user registration
    print("\n  Testing user registration...")
    result = await client.request(
        "POST",
        "/api/v1/auth/register",
        data={
            "email": client.test_user_email,
            "password": client.test_user_password,
            "full_name": "Test User",
        },
    )
    passed = result["status_code"] == 201
    client.print_result(
        "User Registration",
        passed,
        f"Status: {result['status_code']}, Email: {client.test_user_email}",
    )

    if not passed:
        # Check if user already exists
        if result["status_code"] == 400:
            print("  Note: User already exists, skipping registration")

    # Test user login
    print("\n  Testing user login...")
    result = await client.request(
        "POST",
        "/api/v1/auth/login",
        data={
            "email": client.test_user_email,
            "password": client.test_user_password,
        },
    )
    passed = result["status_code"] == 200
    client.print_result("User Login", passed, f"Status: {result['status_code']}")

    if passed:
        client.access_token = result["body"].get("access_token")
        client.refresh_token = result["body"].get("refresh_token")
        print(f"  Access Token: {client.access_token[:50]}...")
        print(f"  Refresh Token: {client.refresh_token[:50]}...")

    # Test current user endpoint (requires auth)
    if client.access_token:
        print("\n  Testing current user profile...")
        result = await client.request("GET", "/api/v1/auth/me", auth=True)
        passed = result["status_code"] == 200
        client.print_result(
            "Get Current User Profile",
            passed,
            f"Status: {result['status_code']}, Email: {result['body'].get('email')}",
        )

    # Test token refresh
    if client.refresh_token:
        print("\n  Testing token refresh...")
        result = await client.request(
            "POST",
            "/api/v1/auth/refresh",
            data={"refresh_token": client.refresh_token},
        )
        passed = result["status_code"] == 200
        client.print_result("Token Refresh", passed, f"Status: {result['status_code']}")

        if passed:
            client.access_token = result["body"].get("access_token")

    # Test password change
    if client.access_token:
        print("\n  Testing password change...")
        result = await client.request(
            "PUT",
            "/api/v1/auth/password",
            data={
                "old_password": client.test_user_password,
                "new_password": "NewPassword456!",
            },
            auth=True,
        )
        passed = result["status_code"] == 200
        client.print_result(
            "Password Change", passed, f"Status: {result['status_code']}"
        )

        if passed:
            # Update password for subsequent tests
            client.test_user_password = "NewPassword456!"


async def test_presidents(client: APITestClient):
    """Test president endpoints"""
    print("\n=== Testing Presidents Endpoints ===")

    # Test list presidents
    print("\n  Testing list presidents...")
    result = await client.request("GET", "/api/v1/presidents")
    passed = result["status_code"] == 200
    total = len(result["body"]) if isinstance(result["body"], list) else 0
    client.print_result(
        "List Presidents",
        passed,
        f"Status: {result['status_code']}, Count: {total}",
    )

    if passed and total > 0:
        # Test get single president
        print("\n  Testing get president details...")
        president_id = result["body"][0]["id"]
        result = await client.request(f"GET", f"/api/v1/presidents/{president_id}")
        passed = result["status_code"] == 200
        name = result["body"].get("name", "Unknown")
        client.print_result(
            "Get President Details",
            passed,
            f"Status: {result['status_code']}, Name: {name}",
        )

        # Test get president actions
        print("\n  Testing get president actions...")
        result = await client.request(
            "GET",
            f"/api/v1/presidents/{president_id}/actions",
            params={"limit": 10},
        )
        passed = result["status_code"] == 200
        client.print_result(
            "Get President Actions", passed, f"Status: {result['status_code']}"
        )

        # Test get president cabinet
        print("\n  Testing get president cabinet...")
        result = await client.request(
            "GET",
            f"/api/v1/presidents/{president_id}/cabinet",
        )
        passed = result["status_code"] == 200
        cabinet_count = (
            result["body"].get("total_members", 0)
            if isinstance(result["body"], dict)
            else 0
        )
        client.print_result(
            "Get President Cabinet",
            passed,
            f"Status: {result['status_code']}, Members: {cabinet_count}",
        )

        # Test get president stats
        print("\n  Testing get president statistics...")
        result = await client.request(
            "GET",
            f"/api/v1/presidents/{president_id}/stats",
        )
        passed = result["status_code"] == 200
        client.print_result(
            "Get President Statistics", passed, f"Status: {result['status_code']}"
        )


async def test_politicians(client: APITestClient):
    """Test politician endpoints"""
    print("\n=== Testing Politicians Endpoints ===")

    # Test list politicians
    print("\n  Testing list politicians...")
    result = await client.request("GET", "/api/v1/politicians")
    passed = result["status_code"] == 200
    client.print_result("List Politicians", passed, f"Status: {result['status_code']}")

    if passed:
        body = result["body"]
        politicians = body.get("politicians", []) if isinstance(body, dict) else body

        if politicians:
            # Test get single politician
            print("\n  Testing get politician details...")
            politician_id = politicians[0].get("politician_id")
            result = await client.request(
                "GET",
                f"/api/v1/politicians/{politician_id}",
            )
            passed = result["status_code"] == 200
            name = result["body"].get("name", "Unknown")
            client.print_result(
                "Get Politician Details",
                passed,
                f"Status: {result['status_code']}, Name: {name}",
            )

            # Test get politician actions
            print("\n  Testing get politician actions...")
            result = await client.request(
                "GET",
                f"/api/v1/politicians/{politician_id}/actions",
                params={"limit": 5},
            )
            passed = result["status_code"] == 200
            client.print_result(
                "Get Politician Actions", passed, f"Status: {result['status_code']}"
            )

            # Test get politician votes
            print("\n  Testing get politician votes...")
            result = await client.request(
                "GET",
                f"/api/v1/politicians/{politician_id}/votes",
                params={"limit": 5},
            )
            passed = result["status_code"] == 200
            client.print_result(
                "Get Politician Votes", passed, f"Status: {result['status_code']}"
            )


async def test_promises(client: APITestClient):
    """Test promise endpoints (Actions vs Words Engine)"""
    print("\n=== Testing Promises Endpoints ===")

    # Test list promises
    print("\n  Testing list promises...")
    result = await client.request("GET", "/api/v1/promises")
    passed = result["status_code"] == 200
    client.print_result("List Promises", passed, f"Status: {result['status_code']}")

    # Test unfulfilled promises
    print("\n  Testing unfulfilled promises...")
    result = await client.request("GET", "/api/v1/promises/unfulfilled")
    passed = result["status_code"] == 200
    client.print_result(
        "Get Unfulfilled Promises", passed, f"Status: {result['status_code']}"
    )


async def test_bills(client: APITestClient):
    """Test bill endpoints"""
    print("\n=== Testing Bills Endpoints ===")

    # Test list bills
    print("\n  Testing list bills...")
    result = await client.request("GET", "/api/v1/bills")
    passed = result["status_code"] == 200
    client.print_result("List Bills", passed, f"Status: {result['status_code']}")

    if passed:
        body = result["body"]
        bills = body.get("bills", []) if isinstance(body, dict) else body

        if bills:
            # Test get single bill
            print("\n  Testing get bill details...")
            bill_id = bills[0]["id"]
            result = await client.request("GET", f"/api/v1/bills/{bill_id}")
            passed = result["status_code"] == 200
            title = result["body"].get("title", "Unknown")[:50]
            client.print_result(
                "Get Bill Details",
                passed,
                f"Status: {result['status_code']}, Title: {title}...",
            )


async def test_search(client: APITestClient):
    """Test search endpoints"""
    print("\n=== Testing Search Endpoints ===")

    # Test global search
    print("\n  Testing global search...")
    result = await client.request("GET", "/api/v1/search", params={"q": "healthcare"})
    passed = result["status_code"] == 200
    client.print_result("Global Search", passed, f"Status: {result['status_code']}")

    # Test politician search
    print("\n  Testing politician search...")
    result = await client.request(
        "GET", "/api/v1/search/politicians", params={"q": "Smith"}
    )
    passed = result["status_code"] == 200
    client.print_result("Politician Search", passed, f"Status: {result['status_code']}")


async def test_analytics(client: APITestClient):
    """Test analytics endpoints"""
    print("\n=== Testing Analytics Endpoints ===")

    # Test transparency scores (need a politician_id if available)
    print("\n  Testing transparency scores...")
    # Try with a sample politician_id - this might fail if no data exists
    result = await client.request("GET", "/api/v1/analytics/top-performers")
    passed = result["status_code"] == 200
    client.print_result("Top Performers", passed, f"Status: {result['status_code']}")


async def test_compare(client: APITestClient):
    """Test comparison endpoints"""
    print("\n=== Testing Compare Endpoints ===")

    # Test president comparison
    print("\n  Testing president comparison...")
    result = await client.request("GET", "/api/v1/compare/presidents/1/with/2")
    passed = result["status_code"] == 200
    client.print_result(
        "Compare Presidents", passed, f"Status: {result['status_code']}"
    )


async def test_pagination(client: APITestClient):
    """Test pagination functionality"""
    print("\n=== Testing Pagination ===")

    # Test with different offset values
    offsets = [0, 10, 20]
    for offset in offsets:
        result = await client.request(
            "GET",
            "/api/v1/presidents",
            params={"limit": 10, "offset": offset},
        )
        passed = result["status_code"] == 200
        client.print_result(
            f"Pagination (offset={offset})",
            passed,
            f"Status: {result['status_code']}",
        )


async def test_error_handling(client: APITestClient):
    """Test error handling and validation"""
    print("\n=== Testing Error Handling ===")

    # Test non-existent resource
    print("\n  Testing 404 handling...")
    result = await client.request("GET", "/api/v1/presidents/99999")
    passed = result["status_code"] == 404
    client.print_result("404 Not Found", passed, f"Status: {result['status_code']}")

    # Test invalid parameters
    print("\n  Testing invalid parameters...")
    result = await client.request(
        "GET",
        "/api/v1/presidents",
        params={"limit": -1},
    )
    passed = result["status_code"] in [400, 422]
    client.print_result(
        "Invalid Parameter Validation",
        passed,
        f"Status: {result['status_code']}",
    )

    # Test unauthenticated access
    print("\n  Testing unauthenticated access...")
    client.access_token = None  # Clear token
    result = await client.request("GET", "/api/v1/auth/me", auth=True)
    passed = result["status_code"] == 401
    client.print_result(
        "Unauthorized Access",
        passed,
        f"Status: {result['status_code']}",
    )


async def run_all_tests():
    """Run all API tests"""
    print("=" * 60)
    print("  THE GLASS HOUSE - API TEST SUITE")
    print("=" * 60)
    print(f"Base URL: http://localhost:8000")
    print("Starting tests...\n")

    client = APITestClient()

    try:
        await client.start()

        # Run all test suites
        await test_api_health(client)
        await test_authentication(client)
        await test_presidents(client)
        await test_politicians(client)
        await test_promises(client)
        await test_bills(client)
        await test_search(client)
        await test_analytics(client)
        await test_compare(client)
        await test_pagination(client)
        await test_error_handling(client)

        # Print summary
        print("\n" + "=" * 60)
        print("  TEST SUMMARY")
        print("=" * 60)
        print(f"  Total Tests: {client.results['passed'] + client.results['failed']}")
        print(f"  Passed: {client.results['passed']}")
        print(f"  Failed: {client.results['failed']}")

        if client.results["errors"]:
            print("\n  Failed Tests:")
            for error in client.results["errors"]:
                print(f"    - {error}")

        print("=" * 60)

    except Exception as e:
        print(f"\n❌ ERROR: {str(e)}")
        print("Make sure the server is running: docker-compose up")

    finally:
        await client.stop()


def run_sync():
    """Run tests synchronously"""
    asyncio.run(run_all_tests())


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "--sync":
        run_sync()
    else:
        asyncio.run(run_all_tests())
