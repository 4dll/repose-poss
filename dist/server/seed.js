import { db, initDb } from "./db.js";
initDb();
const count = db.prepare("SELECT COUNT(*) as c FROM menu_items").get();
if (count.c === 0) {
    const items = [
        ["Espresso", 2.5, 100],
        ["Americano", 3.0, 100],
        ["Latte", 4.0, 80],
        ["Cappuccino", 4.0, 80],
        ["Flat White", 4.5, 60],
        ["Mocha", 4.5, 60],
        ["Hot Chocolate", 3.5, 50],
        ["Tea", 2.0, 80],
        ["Croissant", 2.5, 40],
        ["Sandwich", 5.5, 30],
        ["Muffin", 3.0, 35],
        ["Water", 1.0, 100],
    ];
    const insert = db.prepare("INSERT INTO menu_items (name, price, stock_qty) VALUES (?, ?, ?)");
    for (const [name, price, stock] of items) {
        insert.run(name, price, stock);
    }
    console.log("Sample menu and stock added.");
}
else {
    console.log("Menu already exists, skipping seed.");
}
