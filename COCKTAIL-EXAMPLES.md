# Cocktail Use Case: Example Queries

This guide provides specific examples for using Homebox + Open WebUI to manage your home bar and get cocktail recommendations.

## Setting Up Your Bar Inventory

### Recommended Homebox Structure

#### Locations

```
Bar Cart
├── Top Shelf (Premium spirits)
├── Bottom Shelf (Mixers)
└── Tools Drawer

Kitchen - Bar Cabinet
├── Liquor Shelf
├── Mixer Shelf
└── Glassware Shelf

Pantry
└── Bar Supplies
```

#### Tags

Create these tags in Homebox:

- `Spirits` - All alcoholic spirits
- `Liquor` - General alcohol category
- `Mixers` - Non-alcoholic mixers
- `Garnishes` - Lemons, limes, cherries, etc.
- `Bar Tools` - Shakers, strainers, jiggers, etc.
- `Bitters` - Aromatic bitters
- `Syrups` - Simple syrup, grenadine, etc.

Add sub-categories for spirits:

- `Vodka`
- `Gin`
- `Rum`
- `Whiskey`
- `Tequila`
- `Bourbon`
- `Scotch`

### Example Items

#### Spirit Example

```
Name: Grey Goose Vodka
Description: Premium French vodka, 750ml, 40% ABV. Opened: 2024-11-01
Location: Bar Cart > Top Shelf
Tags: Spirits, Vodka, Liquor
Quantity: 1
```

#### Mixer Example

```
Name: Tonic Water
Description: Fever-Tree Premium Indian Tonic Water, 4-pack
Location: Bar Cart > Bottom Shelf
Tags: Mixers
Quantity: 3
```

#### Bar Tool Example

```
Name: Cocktail Shaker
Description: Stainless steel Boston shaker, 28oz
Location: Bar Cart > Tools Drawer
Tags: Bar Tools
Quantity: 1
```

## Example Conversations with LLM

### Basic Inventory Queries

**Query 1: See what you have**

```
User: What alcohol do I have in my inventory?

LLM: [Calls search_homebox_items("alcohol")]
Let me check your alcohol inventory...

You have the following spirits:
• Grey Goose Vodka (Bar Cart)
• Tanqueray Gin (Bar Cart - Top Shelf)
• Bacardi Superior Rum (Bar Cart)
• Maker's Mark Bourbon (Bar Cabinet)
• Jameson Irish Whiskey (Bar Cabinet)
• Patron Silver Tequila (Bar Cart - Top Shelf)
```

**Query 2: Check specific location**

```
User: What's on my bar cart?

LLM: [Calls get_items_by_location("Bar Cart")]
Your bar cart contains:

Top Shelf:
• Grey Goose Vodka
• Tanqueray Gin
• Patron Silver Tequila

Bottom Shelf:
• Tonic Water (3 bottles)
• Club Soda (2 bottles)
• Simple Syrup

Tools Drawer:
• Cocktail Shaker
• Jigger
• Bar Spoon
```

**Query 3: Check by category**

```
User: Show me all my vodka

LLM: [Calls get_items_by_tag("Vodka")]
You have these vodkas in your collection:

• Grey Goose Vodka
  Location: Bar Cart - Top Shelf
  Description: Premium French vodka, 750ml, 40% ABV
  Quantity: 1

• Tito's Handmade Vodka
  Location: Bar Cabinet
  Description: American craft vodka, 1L, 40% ABV
  Quantity: 1
```

### Cocktail Recipe Queries

**Query 4: Make a specific cocktail**

```
User: I want to make a Moscow Mule. Do I have everything?

LLM: [Calls search_homebox_items("vodka"), search_homebox_items("ginger beer"), search_homebox_items("lime")]

Great! You have everything needed for a Moscow Mule:

✅ Vodka: Grey Goose Vodka (Bar Cart)
✅ Ginger Beer: Fever-Tree Ginger Beer (Bar Cart - Bottom Shelf)
✅ Lime: Fresh limes (Kitchen)

Moscow Mule Recipe:
- 2 oz vodka
- 4 oz ginger beer
- 0.5 oz fresh lime juice
- Lime wedge for garnish

Serve in a copper mug over ice. Enjoy!
```

**Query 5: Recipe suggestions**

```
User: What cocktails can I make with what I have?

LLM: [Calls list_homebox_locations(), searches for spirits and mixers]

Based on your current inventory, here are cocktails you can make:

🍸 **Martini**
- Gin (Tanqueray) ✅
- Dry Vermouth ✅
- Olives ✅

🍹 **Mojito**
- Rum (Bacardi Superior) ✅
- Fresh Mint ✅
- Lime ✅
- Simple Syrup ✅
- Club Soda ✅

🥃 **Old Fashioned**
- Bourbon (Maker's Mark) ✅
- Bitters (Angostura) ✅
- Simple Syrup ✅
- Orange Peel ✅

🍋 **Gin & Tonic**
- Gin (Tanqueray) ✅
- Tonic Water (3 bottles) ✅
- Lime ✅

Would you like the recipe for any of these?
```

**Query 6: Suggest with substitutions**

```
User: I want to make a Margarita but I'm not sure if I have everything

LLM: [Calls search_homebox_items("tequila"), search_homebox_items("triple sec"), search_homebox_items("lime")]

For a classic Margarita you need:
- Tequila ✅ (You have Patron Silver)
- Triple Sec/Cointreau ❌ (You don't have this)
- Fresh lime juice ✅ (You have limes)
- Salt for rim ✅

You're missing Triple Sec, but you could:
1. **Substitute**: Use a splash of simple syrup instead (less authentic but still tasty)
2. **Add to shopping list**: Pick up Cointreau or Triple Sec

Would you like me to help you add Triple Sec to your Homebox shopping list?
```

### Shopping and Planning

**Query 7: What's running low**

```
User: What bar supplies am I running low on?

LLM: [Calls search_homebox_items("bar"), checks quantities]

Items with low quantity (<2):
• Tonic Water: 1 bottle left (in Bar Cart)
• Fresh Limes: 1 remaining (in Kitchen)
• Angostura Bitters: Nearly empty (Bar Cabinet)
• Simple Syrup: Half bottle (Bar Cart)

Recommendations:
- Stock up on tonic water if you like G&Ts
- Get fresh limes for your next grocery run
- Consider making a new batch of simple syrup
- Replace bitters soon
```

**Query 8: Party planning**

```
User: I'm having 8 people over for cocktails. What should I make based on what I have?

LLM: [Analyzes full inventory for crowd-friendly options]

Perfect! For 8 people, I recommend a signature cocktail everyone can enjoy. Based on your inventory:

🎉 **Best Option: Paloma Bar**
You have plenty of:
- Tequila (Patron Silver) ✅
- Grapefruit juice ✅
- Lime ✅
- Club soda ✅

Each Paloma uses 2oz tequila, so your 750ml bottle can make ~12 drinks (plenty for 8 guests).

Alternative if guests prefer variety:
- Margaritas (with simple syrup substitute)
- Gin & Tonics (you have 3 tonics)
- Whiskey Sours (using your Maker's Mark)

Would you like me to create a shopping list for what you'll need to restock after the party?
```

### Learning and Discovery

**Query 9: What can I make with specific spirit**

```
User: I have Maker's Mark bourbon. What cocktails use bourbon?

LLM: Classic bourbon cocktails you can make with Maker's Mark:

**Have all ingredients:**
✅ Old Fashioned (bourbon, bitters, simple syrup, orange)
✅ Whiskey Sour (bourbon, lemon juice, simple syrup)
✅ Mint Julep (bourbon, mint, simple syrup)

**Missing ingredients:**
❌ Manhattan (need sweet vermouth)
❌ Boulevardier (need Campari and sweet vermouth)

Would you like the recipe for any of these?
```

**Query 10: Suggest new purchases**

```
User: What should I buy next to expand my cocktail options?

LLM: [Analyzes current inventory and common cocktail requirements]

Great question! Based on what you have, these additions would unlock many new cocktails:

**Top Priority:**
1. **Dry Vermouth** ($15-20)
   - Unlocks: Martinis, Manhattans
   - Pairs with: Your gin and bourbon

2. **Triple Sec/Cointreau** ($20-30)
   - Unlocks: Margaritas, Cosmopolitans, Sidecars
   - Pairs with: Your tequila and vodka

**Nice to Have:**
3. **Campari** ($25-30)
   - Unlocks: Negronis, Boulevardiers
   - Sophisticated aperitif options

4. **Coffee Liqueur (Kahlúa)** ($20-25)
   - Unlocks: White Russians, Espresso Martinis
   - Pairs with: Your vodka

These 4 bottles would add 15+ new cocktail options to your repertoire!
```

## Advanced Queries

### Seasonal Recommendations

```
User: It's summer. What refreshing cocktails can I make?

LLM: Perfect! Here are refreshing summer cocktails you can make:

🌊 **Most Refreshing:**
1. Mojito (rum, mint, lime, soda)
2. Gin & Tonic (gin, tonic, lime)
3. Moscow Mule (vodka, ginger beer, lime)
4. Paloma (tequila, grapefruit, soda)

All use ingredients you currently have in stock!
```

### Flavor Profile Matching

```
User: I like sweet cocktails. What can you recommend?

LLM: Based on your preference for sweet cocktails and your inventory:

🍬 **Sweet Options:**
1. **Rum & Coke** - Your Bacardi + cola (if you have it)
2. **Whiskey Sour** - Maker's Mark + lemon + simple syrup (naturally sweet)
3. **Moscow Mule** - Vodka + sweet ginger beer
4. **Mai Tai** - If you add orgeat syrup to your bar

You tend to have spirits that work well in sweet cocktails. Consider adding:
- Amaretto
- Baileys Irish Cream
- Frangelico

These would unlock many dessert cocktails!
```

### Batch Cocktails

```
User: I need a batch cocktail recipe for my party. What can I pre-make?

LLM: Great idea! Based on your inventory, these batch well:

🍊 **Recommended: Whiskey Sour Pitcher** (Serves 8)
You have everything:
- 16 oz Maker's Mark bourbon ✅
- 8 oz fresh lemon juice ✅
- 6 oz simple syrup ✅
- Ice and lemon wheels for serving ✅

Mix everything except ice, refrigerate up to 4 hours. Serve over ice.

Alternative: Batch Gin & Tonics
- Pre-portion gin in bottles
- Guests add tonic to preference
- Keeps drinks fizzy!
```

## Tips for Best Results

### 1. Be Specific in Homebox

```
❌ "Bourbon"
✅ "Maker's Mark Kentucky Straight Bourbon Whiskey"
```

### 2. Include ABV and Size

```
Description: "750ml, 40% ABV, opened 2024-11"
```

### 3. Track Open vs Sealed

```
Tags: ["Spirits", "Vodka", "Open"]
or
Tags: ["Spirits", "Vodka", "Sealed"]
```

### 4. Use Custom Fields for:

- Purchase date
- Expiration (for mixers)
- Price paid
- Tasting notes
- Rating (1-5 stars)

### 5. Maintain Sub-locations

```
Bar Cart > Top Shelf
Bar Cart > Bottom Shelf
Bar Cart > Tools Drawer
```

## Common Cocktails Reference

Here's what to keep in stock for popular cocktails:

| Cocktail      | Base Spirit | Other Ingredients              |
| ------------- | ----------- | ------------------------------ |
| Martini       | Gin         | Dry vermouth, olives           |
| Margarita     | Tequila     | Triple sec, lime               |
| Old Fashioned | Bourbon     | Bitters, simple syrup, orange  |
| Mojito        | Rum         | Mint, lime, soda, simple syrup |
| Manhattan     | Whiskey     | Sweet vermouth, bitters        |
| Daiquiri      | Rum         | Lime, simple syrup             |
| Negroni       | Gin         | Campari, sweet vermouth        |
| Whiskey Sour  | Bourbon     | Lemon, simple syrup            |
| Moscow Mule   | Vodka       | Ginger beer, lime              |
| Gin & Tonic   | Gin         | Tonic water, lime              |

## Integration with Recipe Sites

You could even ask:

```
User: Find me a cocktail recipe from Liquor.com that uses what I have

LLM: [Searches inventory, references external recipes]
```

Though this requires additional Open WebUI functions or web search capabilities.

---

**Happy mixing! 🍸**

With this setup, your LLM becomes your personal bartender, always aware of what you have in stock and ready to suggest the perfect drink.
