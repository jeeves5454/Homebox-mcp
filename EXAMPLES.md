# Example Queries for Homebox MCP Server

Once you have the Homebox MCP server configured with Claude Desktop, you can ask Claude to interact with your Homebox inventory in natural language. Here are some example queries and what they do:

## Basic Searches

### Search for Items

**Ask Claude:**

> "Can you search my Homebox inventory for 'screwdriver'?"

**What happens:**
Claude will use the `search_items` tool to find all items matching "screwdriver"

---

**Ask Claude:**

> "Do I have any power tools in my inventory?"

**What happens:**
Claude searches for "power tools" and shows you the results

---

## Exploring Locations

### List All Locations

**Ask Claude:**

> "What locations do I have in my Homebox?"

or

> "Show me all my storage locations"

**What happens:**
Claude uses `list_locations` to show you all your storage locations (like Garage, Kitchen, Basement, etc.)

---

### Find Items in a Location

**Ask Claude:**

> "What items do I have in the garage?"

**What happens:**
Claude will:

1. First use `list_locations` to find the garage's ID
2. Then use `get_items_by_location` to show all items stored there

---

**Ask Claude:**

> "Show me everything in my basement storage"

**What happens:**
Same process - Claude finds the location and lists all items there

---

## Working with Tags

### List All Tags

**Ask Claude:**

> "What tags am I using in Homebox?"

or

> "Show me all my item categories"

**What happens:**
Claude uses `list_tags` to show all your tags/categories

---

### Find Items by Tag

**Ask Claude:**

> "Show me all items tagged as 'Electronics'"

**What happens:**
Claude will:

1. Use `list_tags` to find the Electronics tag ID
2. Use `get_items_by_tag` to show all electronics

---

**Ask Claude:**

> "What do I have that's tagged 'Important Documents'?"

**What happens:**
Same process for finding items with that tag

---

## Getting Detailed Information

### Item Details

**Ask Claude:**

> "Can you get the full details for item ID abc-123-def?"

**What happens:**
Claude uses `get_item` to show complete information including:

- Name and description
- Location
- Tags
- Purchase information (price, date, store)
- Warranty information
- Serial number
- And more

---

## Complex Queries

### Multi-step Questions

**Ask Claude:**

> "What's the most expensive item in my garage?"

**What happens:**
Claude will:

1. Find the garage location
2. Get all items in the garage
3. Analyze the purchase prices
4. Tell you which one is most expensive

---

**Ask Claude:**

> "How many electronics do I have and where are they located?"

**What happens:**
Claude will:

1. Find items tagged "Electronics"
2. Count them
3. Show you the locations for each

---

**Ask Claude:**

> "Do I have a warranty for my lawn mower?"

**What happens:**
Claude will:

1. Search for "lawn mower"
2. Get the item details
3. Check the warranty information
4. Tell you if there's an active warranty

---

## Inventory Management

### Finding Duplicates

**Ask Claude:**

> "Do I have multiple hammers in my inventory?"

**What happens:**
Claude searches for "hammer" and shows you all matches

---

### Location Organization

**Ask Claude:**

> "What's in my Kitchen versus my Garage?"

**What happens:**
Claude gets items from both locations and compares them

---

### Maintenance Tracking

**Ask Claude:**

> "Which of my items have warranty information recorded?"

**What happens:**
Claude can search through items and check their warranty fields

---

## Reporting

### Summary Information

**Ask Claude:**

> "Give me a summary of my home inventory"

**What happens:**
Claude will:

1. Get all locations
2. Get all tags
3. Possibly sample some items
4. Provide an overview of your inventory organization

---

**Ask Claude:**

> "What's the total value of items in my garage?"

**What happens:**
Claude gets all garage items, adds up their purchase prices, and tells you the total

---

## Tips for Better Results

1. **Be specific:** Instead of "find my tool", say "find my cordless drill"

2. **Use natural language:** Claude understands context, so you can ask conversationally

3. **Ask follow-up questions:**
   - First: "Show me my garage items"
   - Then: "Which of those are power tools?"

4. **Combine information:**
   - "Which items in my basement are tagged as seasonal decorations?"

5. **Request analysis:**
   - "Which room has the most items?"
   - "What percentage of my items have purchase receipts?"

## Understanding the Data

When Claude retrieves data from Homebox, it can see:

- **Item Information:**
  - Name, description
  - Location
  - Tags
  - Purchase price, date, store
  - Warranty information
  - Serial numbers
  - Condition notes
  - Photos (referenced)

- **Location Information:**
  - Location name
  - Description
  - Parent location (for nested locations)
  - All items in that location

- **Tag Information:**
  - Tag name
  - Description
  - Color coding
  - All items with that tag

## Common Use Cases

### Moving House

> "List all items in the garage so I can plan what to pack first"

### Insurance Claims

> "Show me all electronics with their purchase prices and dates"

### Spring Cleaning

> "What items do I have in storage that I haven't used in over a year?"

### Shopping

> "Do I already have a ladder? If so, what type?"

### Maintenance

> "Which appliances have warranty information and when do they expire?"

### Organization

> "How are my items currently organized by location?"

## Working with Multiple Collections

If your Homebox account belongs to more than one collection, you can access all of them from Claude without switching accounts.

### Discover your collections

**Ask Claude:**

> "What collections do I have in Homebox?"

**What happens:**
Claude calls `list_collections` and shows you all collections, noting which one is your default.

---

### Query a specific collection

**Ask Claude:**

> "Show me everything in my Artwork collection"

or

> "Search for 'sofa' in the Appliances collection"

**What happens:**
Claude passes the collection name to each inventory tool as needed. The request is scoped to that collection only — data from other collections is never mixed in.

---

### Cross-collection questions

**Ask Claude:**

> "Do I have any ladders? Check all my collections."

**What happens:**
Claude calls `list_collections` to discover all collections, then searches each one and combines the results for you.

## Getting Help

If Claude seems confused or gives an error:

1. Make sure Homebox is running
2. Check that the MCP server is configured correctly in Claude Desktop
3. Try restarting Claude Desktop
4. Be more specific in your query
5. Check the main README.md for troubleshooting tips
