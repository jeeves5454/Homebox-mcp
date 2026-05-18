"""
title: Homebox Item Search
author: open-webui
author_url: https://github.com/open-webui
funding_url: https://github.com/open-webui
version: 1.0.1
license: MIT
description: Search for items in your Homebox home inventory
required_open_webui_version: 0.5.0
requirements: requests
"""

import requests
from typing import Optional
from pydantic import BaseModel, Field
from fastapi import Request


class Tools:
    class Valves(BaseModel):
        HOMEBOX_URL: str = Field(
            default="http://homebox:7745",
            description="Homebox server URL (use container name if in same Docker network)"
        )
        HOMEBOX_EMAIL: str = Field(
            default="",
            description="Homebox login email"
        )
        HOMEBOX_PASSWORD: str = Field(
            default="",
            description="Homebox login password"
        )

    def __init__(self):
        self.valves = self.Valves()
        self.token = None

    def _authenticate(self) -> bool:
        """Authenticate with Homebox and get access token"""
        try:
            response = requests.post(
                f"{self.valves.HOMEBOX_URL}/api/v1/users/login",
                json={
                    "username": self.valves.HOMEBOX_EMAIL,
                    "password": self.valves.HOMEBOX_PASSWORD
                },
                timeout=10
            )
            response.raise_for_status()
            data = response.json()
            self.token = data.get("token")
            return self.token is not None
        except Exception as e:
            print(f"Authentication failed: {e}")
            return False

    def _get_headers(self) -> dict:
        """Get authenticated request headers"""
        if not self.token:
            self._authenticate()
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }

    async def search_homebox_items(
        self,
        query: str,
        __request__: Request,
        __user__: dict = {},
        __event_emitter__=None
    ) -> str:
        """
        Search for items in Homebox inventory by name or description.
        Use this to find items based on keywords.

        :param query: Search query (e.g., "vodka", "gin", "tools")
        :return: List of matching items with details
        """
        try:
            response = requests.get(
                f"{self.valves.HOMEBOX_URL}/api/v1/items",
                headers=self._get_headers(),
                params={"q": query},
                timeout=10
            )
            response.raise_for_status()
            data = response.json()

            items = data.get("items", [])
            if not items:
                return f"No items found matching '{query}'"

            result = f"Found {len(items)} items matching '{query}':\n\n"
            for item in items[:10]:  # Limit to 10 items
                result += f"• {item.get('name', 'Unknown')}\n"
                if item.get('description'):
                    result += f"  Description: {item['description']}\n"
                if item.get('location'):
                    result += f"  Location: {item['location'].get('name', 'Unknown')}\n"
                if item.get('quantity', 0) > 0:
                    result += f"  Quantity: {item['quantity']}\n"
                result += "\n"

            return result
        except Exception as e:
            return f"Error searching items: {str(e)}"

    async def get_items_by_location(
        self,
        location_name: str,
        __request__: Request,
        __user__: dict = {},
        __event_emitter__=None
    ) -> str:
        """
        Get all items stored in a specific location.
        Use this to see what's available in a particular place.

        :param location_name: Name of the location (e.g., "Bar", "Kitchen", "Garage")
        :return: List of items in that location
        """
        try:
            # First, get all locations to find the ID
            response = requests.get(
                f"{self.valves.HOMEBOX_URL}/api/v1/locations",
                headers=self._get_headers(),
                timeout=10
            )
            response.raise_for_status()
            locations = response.json().get("items", [])

            # Find matching location
            location_id = None
            for loc in locations:
                if loc.get("name", "").lower() == location_name.lower():
                    location_id = loc.get("id")
                    break

            if not location_id:
                return f"Location '{location_name}' not found. Available locations: {', '.join([l.get('name', '') for l in locations])}"

            # Get items in this location
            response = requests.get(
                f"{self.valves.HOMEBOX_URL}/api/v1/locations/{location_id}",
                headers=self._get_headers(),
                timeout=10
            )
            response.raise_for_status()
            data = response.json()

            items = data.get("items", [])
            if not items:
                return f"No items found in location '{location_name}'"

            result = f"Items in '{location_name}' ({len(items)} total):\n\n"
            for item in items:
                result += f"• {item.get('name', 'Unknown')}\n"
                if item.get('description'):
                    result += f"  Description: {item['description']}\n"
                if item.get('quantity', 0) > 0:
                    result += f"  Quantity: {item['quantity']}\n"
                result += "\n"

            return result
        except Exception as e:
            return f"Error getting items by location: {str(e)}"

    async def list_homebox_locations(
        self,
        __request__: Request,
        __user__: dict = {},
        __event_emitter__=None
    ) -> str:
        """
        List all storage locations in Homebox.
        Use this to see what locations are available.

        :return: List of all locations
        """
        try:
            response = requests.get(
                f"{self.valves.HOMEBOX_URL}/api/v1/locations",
                headers=self._get_headers(),
                timeout=10
            )
            response.raise_for_status()
            data = response.json()

            locations = data.get("items", [])
            if not locations:
                return "No locations found in Homebox"

            result = f"Homebox Locations ({len(locations)} total):\n\n"
            for loc in locations:
                result += f"• {loc.get('name', 'Unknown')}\n"
                if loc.get('description'):
                    result += f"  Description: {loc['description']}\n"
                item_count = len(loc.get('items', []))
                result += f"  Items: {item_count}\n\n"

            return result
        except Exception as e:
            return f"Error listing locations: {str(e)}"

    async def get_items_by_label(
        self,
        label_name: str,
        __request__: Request,
        __user__: dict = {},
        __event_emitter__=None
    ) -> str:
        """
        Get all items that have a specific tag.
        Use this to find items by category or type.

        Note: this function is named 'get_items_by_label' for backwards compatibility.
        Homebox renamed labels to tags in v0.23.0.

        :param label_name: Name of the tag (e.g., "Alcohol", "Spirits", "Tools")
        :return: List of items with that tag
        """
        try:
            # First, get all labels to find the ID
            response = requests.get(
                f"{self.valves.HOMEBOX_URL}/api/v1/labels",
                headers=self._get_headers(),
                timeout=10
            )
            response.raise_for_status()
            labels = response.json().get("items", [])

            # Find matching label
            label_id = None
            for label in labels:
                if label.get("name", "").lower() == label_name.lower():
                    label_id = label.get("id")
                    break

            if not label_id:
                return f"Label '{label_name}' not found. Available labels: {', '.join([l.get('name', '') for l in labels])}"

            # Get items with this label
            response = requests.get(
                f"{self.valves.HOMEBOX_URL}/api/v1/labels/{label_id}",
                headers=self._get_headers(),
                timeout=10
            )
            response.raise_for_status()
            data = response.json()

            items = data.get("items", [])
            if not items:
                return f"No items found with label '{label_name}'"

            result = f"Items with label '{label_name}' ({len(items)} total):\n\n"
            for item in items:
                result += f"• {item.get('name', 'Unknown')}\n"
                if item.get('description'):
                    result += f"  Description: {item['description']}\n"
                if item.get('location'):
                    result += f"  Location: {item['location'].get('name', 'Unknown')}\n"
                if item.get('quantity', 0) > 0:
                    result += f"  Quantity: {item['quantity']}\n"
                result += "\n"

            return result
        except Exception as e:
            return f"Error getting items by label: {str(e)}"

    async def list_homebox_labels(
        self,
        __request__: Request,
        __user__: dict = {},
        __event_emitter__=None
    ) -> str:
        """
        List all tags in Homebox.
        Use this to see what categories or types are available.

        Note: this function is named 'list_homebox_labels' for backwards compatibility.
        Homebox renamed labels to tags in v0.23.0.

        :return: List of all tags
        """
        try:
            response = requests.get(
                f"{self.valves.HOMEBOX_URL}/api/v1/labels",
                headers=self._get_headers(),
                timeout=10
            )
            response.raise_for_status()
            data = response.json()

            labels = data.get("items", [])
            if not labels:
                return "No labels found in Homebox"

            result = f"Homebox Labels ({len(labels)} total):\n\n"
            for label in labels:
                result += f"• {label.get('name', 'Unknown')}\n"
                if label.get('description'):
                    result += f"  Description: {label['description']}\n"
                item_count = len(label.get('items', []))
                result += f"  Items: {item_count}\n\n"

            return result
        except Exception as e:
            return f"Error listing labels: {str(e)}"
