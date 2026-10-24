import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  ImagePlus,
  LoaderCircle,
  Pencil,
  Plus,
  Trash2,
  UtensilsCrossed,
  Upload,
  X,
} from "lucide-react";

import { supabase } from "../lib/supabaseClient";
import "./MenuManager.css";
import "./MenuBulkImport.css";
import "../RestaurantWorkspaceDesign.css";

const emptyForm = {
  name: "",
  category_id: "",
  description: "",
  price: "",
  image_url: "",
  is_available: true,
};

function formatPrice(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function parseCsvText(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (quoted) {
    throw new Error(
      "This CSV has an unclosed quote. Check the file and try again.",
    );
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

function normalizeCsvHeader(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function readCsvBoolean(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized) return true;
  if (["true", "yes", "1", "available", "active"].includes(normalized))
    return true;
  if (["false", "no", "0", "unavailable", "inactive"].includes(normalized))
    return false;
  return null;
}

function downloadMenuTemplate() {
  const template = [
    "name,category,description,price,is_available,image_url",
    'Masala Dosa,South Indian,"Crispy dosa with potato filling",180,true,',
    'Cold Coffee,Beverages,"Chilled coffee",120,true,',
  ].join("\r\n");
  const blob = new Blob([template], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "khaavio-menu-template.csv";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function MenuManager() {
  const navigate = useNavigate();

  const [userId, setUserId] = useState("");
  const [restaurant, setRestaurant] = useState(null);
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);

  const [categoryName, setCategoryName] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [imageFile, setImageFile] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [filterCategory, setFilterCategory] = useState("all");

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [workspaceMissing, setWorkspaceMissing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [importFileName, setImportFileName] = useState("");
  const [importRows, setImportRows] = useState([]);
  const [importError, setImportError] = useState("");
  const [importNotice, setImportNotice] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspace() {
      setLoading(true);
      setError("");

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;

        if (!user) {
          navigate("/login", { replace: true });
          return;
        }

        const { data: restaurantData, error: restaurantError } = await supabase
          .from("restaurants")
          .select("id, name, slug")
          .eq("owner_id", user.id)
          .maybeSingle();

        if (restaurantError) throw restaurantError;

        if (cancelled) return;

        if (!restaurantData) {
          setWorkspaceMissing(true);
          return;
        }

        setUserId(user.id);
        setRestaurant(restaurantData);

        const [categoryResult, itemResult] = await Promise.all([
          supabase
            .from("menu_categories")
            .select("*")
            .eq("restaurant_id", restaurantData.id),

          supabase
            .from("menu_items")
            .select("*")
            .eq("restaurant_id", restaurantData.id),
        ]);

        if (categoryResult.error) throw categoryResult.error;
        if (itemResult.error) throw itemResult.error;

        if (cancelled) return;

        setCategories(
          [...(categoryResult.data || [])].sort((a, b) =>
            a.name.localeCompare(b.name),
          ),
        );

        setItems(
          [...(itemResult.data || [])].sort(
            (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
          ),
        );
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "Unable to load the menu.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  async function refreshMenu(restaurantId) {
    const [categoryResult, itemResult] = await Promise.all([
      supabase
        .from("menu_categories")
        .select("*")
        .eq("restaurant_id", restaurantId),

      supabase.from("menu_items").select("*").eq("restaurant_id", restaurantId),
    ]);

    if (categoryResult.error) throw categoryResult.error;
    if (itemResult.error) throw itemResult.error;

    setCategories(
      [...(categoryResult.data || [])].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    );

    setItems(
      [...(itemResult.data || [])].sort(
        (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
      ),
    );
  }

  function updateForm(event) {
    const { name, value, type, checked } = event.target;

    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  async function addCategory(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    const trimmedName = categoryName.trim();

    if (!trimmedName || !restaurant) return;

    setBusy(true);

    try {
      const duplicate = categories.some(
        (category) => category.name.toLowerCase() === trimmedName.toLowerCase(),
      );

      if (duplicate) {
        throw new Error("This category already exists.");
      }

      const { error: insertError } = await supabase
        .from("menu_categories")
        .insert({
          restaurant_id: restaurant.id,
          name: trimmedName,
        });

      if (insertError) throw insertError;

      await refreshMenu(restaurant.id);
      setCategoryName("");
      setNotice("Category added successfully.");
    } catch (err) {
      setError(err?.message || "Could not add the category.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCategory(category) {
    const containsItems = items.some(
      (item) => item.category_id === category.id,
    );

    if (containsItems) {
      setError("Move or delete this category's menu items first.");
      return;
    }

    if (!window.confirm(`Delete "${category.name}"?`)) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const { error: deleteError } = await supabase
        .from("menu_categories")
        .delete()
        .eq("id", category.id)
        .eq("restaurant_id", restaurant.id);

      if (deleteError) throw deleteError;

      await refreshMenu(restaurant.id);
      setNotice("Category deleted.");
    } catch (err) {
      setError(err?.message || "Could not delete the category.");
    } finally {
      setBusy(false);
    }
  }

  function startEditing(item) {
    setEditingItem(item);
    setForm({
      name: item.name || "",
      category_id: item.category_id || "",
      description: item.description || "",
      price: String(item.price ?? ""),
      image_url: item.image_url || "",
      is_available: Boolean(item.is_available),
    });
    setImageFile(null);
    setError("");
    setNotice("");

    document
      .getElementById("menu-item-form")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetItemForm() {
    setEditingItem(null);
    setForm(emptyForm);
    setImageFile(null);
  }

  async function saveItem(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!restaurant) return;

    if (!categories.length) {
      setError("Add a category before creating a menu item.");
      return;
    }

    if (!form.category_id) {
      setError("Please select a category.");
      return;
    }

    const price = Number(form.price);

    if (!Number.isFinite(price) || price < 0) {
      setError("Enter a valid, non-negative price.");
      return;
    }

    if (imageFile) {
      if (!imageFile.type.startsWith("image/")) {
        setError("Please select an image file.");
        return;
      }

      if (imageFile.size > 5 * 1024 * 1024) {
        setError("Image must be 5 MB or smaller.");
        return;
      }
    }

    setBusy(true);

    try {
      let imageUrl = form.image_url.trim() || null;

      if (imageFile) {
        const safeName = imageFile.name
          .toLowerCase()
          .replace(/[^a-z0-9._-]/g, "-");

        const storagePath =
          `${userId}/${restaurant.id}/` + `${Date.now()}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from("menu-images")
          .upload(storagePath, imageFile, {
            cacheControl: "3600",
            contentType: imageFile.type,
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from("menu-images")
          .getPublicUrl(storagePath);

        imageUrl = publicUrlData.publicUrl;
      }

      const payload = {
        restaurant_id: restaurant.id,
        category_id: form.category_id,
        name: form.name.trim(),
        description: form.description.trim() || null,
        price,
        image_url: imageUrl,
        is_available: form.is_available,
      };

      if (!payload.name) {
        throw new Error("Menu item name is required.");
      }

      const wasEditing = Boolean(editingItem);

      const result = wasEditing
        ? await supabase
            .from("menu_items")
            .update(payload)
            .eq("id", editingItem.id)
            .eq("restaurant_id", restaurant.id)
        : await supabase.from("menu_items").insert(payload);

      if (result.error) throw result.error;

      await refreshMenu(restaurant.id);
      resetItemForm();
      setNotice(wasEditing ? "Menu item updated." : "Menu item added.");
    } catch (err) {
      setError(err?.message || "Could not save the menu item.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteItem(item) {
    if (!window.confirm(`Delete "${item.name}" from your menu?`)) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const { error: deleteError } = await supabase
        .from("menu_items")
        .delete()
        .eq("id", item.id)
        .eq("restaurant_id", restaurant.id);

      if (deleteError) throw deleteError;

      await refreshMenu(restaurant.id);

      if (editingItem?.id === item.id) resetItemForm();

      setNotice("Menu item deleted.");
    } catch (err) {
      setError(err?.message || "Could not delete the menu item.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleAvailability(item) {
    setError("");
    setNotice("");

    try {
      const nextValue = !item.is_available;

      const { error: updateError } = await supabase
        .from("menu_items")
        .update({ is_available: nextValue })
        .eq("id", item.id)
        .eq("restaurant_id", restaurant.id);

      if (updateError) throw updateError;

      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id ? { ...entry, is_available: nextValue } : entry,
        ),
      );

      setNotice(
        nextValue
          ? `${item.name} is now available.`
          : `${item.name} is now unavailable.`,
      );
    } catch (err) {
      setError(err?.message || "Could not update availability.");
    }
  }

  async function handleCsvFileChange(event) {
    const file = event.target.files?.[0];
    setImportError("");
    setImportNotice("");
    setImportRows([]);
    setImportFileName("");

    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setImportError(
        "Please choose a .csv file. You can export an Excel sheet as CSV first.",
      );
      event.target.value = "";
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setImportError("The CSV file must be 2 MB or smaller.");
      event.target.value = "";
      return;
    }

    try {
      const parsed = parseCsvText(await file.text());
      if (parsed.length < 2) {
        throw new Error(
          "The CSV must include a header row and at least one menu item.",
        );
      }

      const headers = parsed[0].map(normalizeCsvHeader);
      const findColumn = (...aliases) =>
        headers.findIndex((header) => aliases.includes(header));
      const columns = {
        name: findColumn("name", "item", "item_name", "dish", "dish_name"),
        category: findColumn("category", "category_name", "menu_category"),
        description: findColumn("description", "details", "item_description"),
        price: findColumn("price", "item_price", "price_inr", "price_rs"),
        isAvailable: findColumn(
          "is_available",
          "available",
          "availability",
          "status",
        ),
        imageUrl: findColumn("image_url", "image", "photo_url", "image_link"),
      };

      const missingColumns = ["name", "category", "price"].filter(
        (key) => columns[key] < 0,
      );
      if (missingColumns.length) {
        throw new Error(
          `Missing required CSV column${missingColumns.length > 1 ? "s" : ""}: ${missingColumns.join(", ")}. Download the template for the correct format.`,
        );
      }

      const dataRows = parsed.slice(1);
      if (dataRows.length > 500) {
        throw new Error(
          "Import up to 500 menu items at a time. Split larger menus into multiple CSV files.",
        );
      }

      const existingCategoriesByName = new Map(
        categories.map((category) => [
          category.name.trim().toLowerCase(),
          category,
        ]),
      );
      const existingItemKeys = new Set(
        items.map((item) => {
          const category = categories.find(
            (entry) => entry.id === item.category_id,
          );
          return `${category?.name?.trim().toLowerCase() || ""}::${item.name.trim().toLowerCase()}`;
        }),
      );
      const seenItemKeys = new Set();

      const rows = dataRows.map((cells, index) => {
        const read = (column) =>
          column < 0 ? "" : String(cells[column] ?? "").trim();
        const name = read(columns.name);
        const category = read(columns.category);
        const description = read(columns.description);
        const priceText = read(columns.price);
        const imageUrl = read(columns.imageUrl);
        const availabilityText = read(columns.isAvailable);
        const price = Number(priceText);
        const errors = [];

        if (!name) errors.push("Item name is required.");
        else if (name.length > 120)
          errors.push("Item name must be 120 characters or fewer.");
        if (!category) errors.push("Category is required.");
        else if (category.length > 80)
          errors.push("Category must be 80 characters or fewer.");
        if (!priceText || !Number.isFinite(price) || price < 0)
          errors.push("Enter a valid non-negative price.");
        if (description.length > 500)
          errors.push("Description must be 500 characters or fewer.");

        let isAvailable = readCsvBoolean(availabilityText);
        if (isAvailable === null)
          errors.push(
            "Availability must be true/false, yes/no, 1/0, or available/unavailable.",
          );

        if (imageUrl) {
          try {
            const parsedUrl = new URL(imageUrl);
            if (!["http:", "https:"].includes(parsedUrl.protocol)) {
              errors.push("Image URL must start with http:// or https://.");
            }
          } catch {
            errors.push("Enter a valid image URL or leave it blank.");
          }
        }

        const itemKey = `${category.toLowerCase()}::${name.toLowerCase()}`;
        if (name && category && seenItemKeys.has(itemKey)) {
          errors.push(
            "This item appears more than once in the CSV for the same category.",
          );
        } else if (name && category) {
          seenItemKeys.add(itemKey);
        }
        if (
          name &&
          category &&
          existingCategoriesByName.has(category.toLowerCase()) &&
          existingItemKeys.has(itemKey)
        ) {
          errors.push(
            "An item with this name already exists in this category.",
          );
        }

        return {
          rowNumber: index + 2,
          name,
          category,
          description,
          price: priceText,
          numericPrice:
            priceText && Number.isFinite(price) && price >= 0 ? price : null,
          imageUrl,
          isAvailable: isAvailable === null ? true : isAvailable,
          valid: errors.length === 0,
          error: errors.join(" "),
          categoryExists: existingCategoriesByName.has(category.toLowerCase()),
        };
      });

      setImportFileName(file.name);
      setImportRows(rows);
      const validCount = rows.filter((row) => row.valid).length;
      const invalidCount = rows.length - validCount;
      setImportNotice(
        `${rows.length} rows loaded: ${validCount} valid${invalidCount ? `, ${invalidCount} need attention` : ""}.`,
      );
    } catch (err) {
      setImportError(err?.message || "Could not read this CSV file.");
      event.target.value = "";
    }
  }

  async function importMenuItems() {
    if (!restaurant || busy) return;

    const validRows = importRows.filter((row) => row.valid);
    if (!validRows.length) {
      setImportError(
        "There are no valid rows to import. Fix the CSV and upload it again.",
      );
      return;
    }

    setBusy(true);
    setImportError("");
    setImportNotice("");

    try {
      const categoryMap = new Map(
        categories.map((category) => [
          category.name.trim().toLowerCase(),
          category.id,
        ]),
      );
      const categoriesToCreate = new Map();

      for (const row of validRows) {
        const key = row.category.trim().toLowerCase();
        if (!categoryMap.has(key) && !categoriesToCreate.has(key)) {
          categoriesToCreate.set(key, row.category.trim());
        }
      }

      let createdCategories = [];
      if (categoriesToCreate.size > 0) {
        const { data, error: categoryError } = await supabase
          .from("menu_categories")
          .insert(
            [...categoriesToCreate.values()].map((name) => ({
              restaurant_id: restaurant.id,
              name,
            })),
          )
          .select("id, name, restaurant_id");

        if (categoryError) throw categoryError;
        createdCategories = data || [];
        for (const category of createdCategories) {
          categoryMap.set(category.name.trim().toLowerCase(), category.id);
        }
      }

      const payload = validRows.map((row) => {
        const categoryId = categoryMap.get(row.category.trim().toLowerCase());
        if (!categoryId) {
          throw new Error(
            `Could not resolve category "${row.category}". Refresh the menu and try again.`,
          );
        }
        return {
          restaurant_id: restaurant.id,
          category_id: categoryId,
          name: row.name.trim(),
          description: row.description.trim() || null,
          price: row.numericPrice,
          image_url: row.imageUrl.trim() || null,
          is_available: row.isAvailable,
        };
      });

      const { error: itemError } = await supabase
        .from("menu_items")
        .insert(payload);
      if (itemError) throw itemError;

      await refreshMenu(restaurant.id);
      const skippedCount = importRows.length - validRows.length;
      setImportRows([]);
      setImportFileName("");
      setImportNotice(
        `Imported ${payload.length} menu item${payload.length === 1 ? "" : "s"}${createdCategories.length ? ` and created ${createdCategories.length} categor${createdCategories.length === 1 ? "y" : "ies"}` : ""}.${skippedCount ? ` Skipped ${skippedCount} invalid row${skippedCount === 1 ? "" : "s"}.` : ""}`,
      );
      const fileInput = document.getElementById("menu-csv-file");
      if (fileInput) fileInput.value = "";
    } catch (err) {
      console.error("Bulk menu import failed:", err);
      setImportError(
        err?.message ||
          "Could not import the menu. Check your permissions and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  function clearCsvPreview() {
    setImportRows([]);
    setImportFileName("");
    setImportError("");
    setImportNotice("");
    const fileInput = document.getElementById("menu-csv-file");
    if (fileInput) fileInput.value = "";
  }

  const visibleItems =
    filterCategory === "all"
      ? items
      : items.filter((item) => item.category_id === filterCategory);

  if (loading) {
    return (
      <main className="menu-loading">
        <LoaderCircle size={30} className="menu-spinner" />
        <p>Loading your menu...</p>
      </main>
    );
  }

  if (workspaceMissing) {
    return (
      <main className="menu-loading">
        <h2>Restaurant profile not found</h2>
        <p>Set up your restaurant before managing its menu.</p>
        <Link className="menu-primary-button" to="/onboarding">
          Complete setup
        </Link>
      </main>
    );
  }

  return (
    <main className="menu-page">
      <header className="menu-topbar">
        <Link to="/dashboard" className="menu-back-link">
          <ArrowLeft size={17} />
          Dashboard
        </Link>

      </header>

      <div className="menu-container">
        <div className="menu-page-heading">
          <div>
            <span className="menu-eyebrow">RESTAURANT WORKSPACE</span>
            <h1>Menu Manager</h1>
            <p>
              Manage dishes, prices, categories and availability for{" "}
              <strong>{restaurant?.name}</strong>.
            </p>
          </div>

          <div className="menu-count">
            <span>{categories.length}</span> categories
            <i />
            <span>{items.length}</span> items
          </div>
        </div>

        {error && (
          <div className="menu-alert menu-alert-error" role="alert">
            <X size={17} />
            <span>{error}</span>
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}

        {notice && (
          <div className="menu-alert menu-alert-success" role="status">
            <CheckCircle2 size={17} />
            <span>{notice}</span>
            <button aria-label="Dismiss message" onClick={() => setNotice("")}>
              <X size={16} />
            </button>
          </div>
        )}

        <section className="menu-category-panel">
          <div className="menu-section-heading">
            <div>
              <span className="menu-eyebrow">ORGANISE YOUR MENU</span>
              <h2>Categories</h2>
            </div>
            <span className="menu-section-count">{categories.length}</span>
          </div>

          <form className="category-create-form" onSubmit={addCategory}>
            <label className="menu-field">
              <span>New category</span>
              <input
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
                placeholder="e.g. Starters, Main Course, Beverages"
                maxLength={80}
                required
              />
            </label>

            <button className="menu-primary-button" disabled={busy}>
              <Plus size={17} />
              Add category
            </button>
          </form>

          {categories.length ? (
            <div className="menu-category-list">
              {categories.map((category) => {
                const itemCount = items.filter(
                  (item) => item.category_id === category.id,
                ).length;

                return (
                  <div className="menu-category-chip" key={category.id}>
                    <span>{category.name}</span>
                    <small>{itemCount} items</small>
                    <button
                      type="button"
                      aria-label={`Delete ${category.name}`}
                      title={
                        itemCount
                          ? "Move or delete its items first"
                          : "Delete category"
                      }
                      disabled={busy || itemCount > 0}
                      onClick={() => deleteCategory(category)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="menu-empty-inline">
              No categories yet. Add your first one above.
            </p>
          )}
        </section>

        <section
          className="menu-import-panel"
          aria-labelledby="menu-import-title"
        >
          <div className="menu-import-heading">
            <div className="menu-import-title-wrap">
              <div className="menu-import-icon">
                <FileSpreadsheet size={21} />
              </div>
              <div>
                <span className="menu-eyebrow">SAVE TIME ON SETUP</span>
                <h2 id="menu-import-title">Bulk import menu</h2>
                <p>Upload a CSV to add many dishes and categories at once.</p>
              </div>
            </div>
            <button
              type="button"
              className="menu-secondary-button menu-import-template"
              onClick={downloadMenuTemplate}
              disabled={busy}
            >
              <Download size={16} /> Download template
            </button>
          </div>

          <div className="menu-import-format-note">
            <strong>Required columns:</strong> <code>name</code>,{" "}
            <code>category</code>, <code>price</code>.
            <span>
              Optional: <code>description</code>, <code>is_available</code>,{" "}
              <code>image_url</code>.
            </span>
            <small>
              CSV only (max 2 MB, 500 rows). Missing categories are created
              automatically. Existing duplicate items are flagged.
            </small>
          </div>

          <div className="menu-import-upload-row">
            <label className="menu-import-file-label" htmlFor="menu-csv-file">
              <Upload size={18} />
              <span>{importFileName || "Choose a CSV file"}</span>
              <input
                id="menu-csv-file"
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvFileChange}
                disabled={busy}
              />
            </label>
            <span className="menu-import-file-hint">
              Export Excel or Google Sheets as CSV first.
            </span>
          </div>

          {importError && (
            <div className="menu-import-message is-error" role="alert">
              {importError}
            </div>
          )}
          {importNotice && (
            <div className="menu-import-message is-success" role="status">
              <CheckCircle2 size={16} /> <span>{importNotice}</span>
            </div>
          )}

          {importRows.length > 0 && (
            <>
              <div className="menu-import-preview-heading">
                <div>
                  <h3>Import preview</h3>
                  <p>
                    {importRows.filter((row) => row.valid).length} valid of{" "}
                    {importRows.length} rows
                  </p>
                </div>
                <div className="menu-import-preview-actions">
                  <button
                    type="button"
                    className="menu-secondary-button"
                    onClick={clearCsvPreview}
                    disabled={busy}
                  >
                    Clear preview
                  </button>
                  <button
                    type="button"
                    className="menu-primary-button"
                    onClick={importMenuItems}
                    disabled={busy || !importRows.some((row) => row.valid)}
                  >
                    {busy ? (
                      <LoaderCircle size={16} className="menu-spinner" />
                    ) : (
                      <Upload size={16} />
                    )}
                    {busy
                      ? "Importing..."
                      : `Import ${importRows.filter((row) => row.valid).length} valid items`}
                  </button>
                </div>
              </div>
              <div className="menu-import-table-wrap">
                <table className="menu-import-table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Item</th>
                      <th>Category</th>
                      <th>Price</th>
                      <th>Availability</th>
                      <th>Validation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.map((row) => (
                      <tr
                        key={row.rowNumber}
                        className={row.valid ? "is-valid" : "is-invalid"}
                      >
                        <td>{row.rowNumber}</td>
                        <td>
                          <strong>{row.name || "—"}</strong>
                          {row.description && <small>{row.description}</small>}
                          {row.imageUrl && <small>Image URL included</small>}
                        </td>
                        <td>
                          {row.category || "—"}
                          {!row.categoryExists && row.category && row.valid && (
                            <small className="menu-import-create-note">
                              New category
                            </small>
                          )}
                        </td>
                        <td>
                          {row.numericPrice === null
                            ? row.price || "—"
                            : formatPrice(row.numericPrice)}
                        </td>
                        <td>{row.isAvailable ? "Available" : "Unavailable"}</td>
                        <td>
                          <span
                            className={`menu-import-row-status ${row.valid ? "is-valid" : "is-invalid"}`}
                          >
                            {row.valid ? "Ready" : "Needs attention"}
                          </span>
                          {!row.valid && (
                            <small className="menu-import-row-error">
                              {row.error}
                            </small>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="menu-import-footer-note">
                Only valid rows are imported. Invalid rows stay out of the
                database and are listed above.
              </p>
            </>
          )}
        </section>

        <section className="menu-editor-panel" id="menu-item-form">
          <div className="menu-section-heading">
            <div>
              <span className="menu-eyebrow">BUILD YOUR DIGITAL MENU</span>
              <h2>{editingItem ? "Edit menu item" : "Add a menu item"}</h2>
            </div>

            {editingItem && (
              <button
                type="button"
                className="menu-secondary-button"
                onClick={resetItemForm}
                disabled={busy}
              >
                <X size={16} /> Cancel edit
              </button>
            )}
          </div>

          {!categories.length ? (
            <p className="menu-empty-inline">
              First create a category above. Then you can add dishes to it.
            </p>
          ) : (
            <form onSubmit={saveItem} className="menu-item-form">
              <label className="menu-field">
                <span>Item name *</span>
                <input
                  name="name"
                  value={form.name}
                  onChange={updateForm}
                  placeholder="e.g. Paneer Tikka"
                  maxLength={120}
                  required
                />
              </label>

              <label className="menu-field">
                <span>Category *</span>
                <select
                  name="category_id"
                  value={form.category_id}
                  onChange={updateForm}
                  required
                >
                  <option value="">Select category</option>
                  {categories.map((category) => (
                    <option value={category.id} key={category.id}>
                      {" "}
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="menu-field">
                <span>Price (â‚¹) *</span>
                <input
                  name="price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={updateForm}
                  placeholder="199"
                  required
                />
              </label>

              <label className="menu-field menu-field-wide">
                <span>Description</span>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={updateForm}
                  placeholder="Describe the dish, ingredients or serving size..."
                  maxLength={500}
                  rows={3}
                />
              </label>

              <label className="menu-field menu-field-wide">
                <span>Dish photo (optional, max 5 MB)</span>
                <div className="menu-upload-control">
                  <ImagePlus size={21} />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) =>
                      setImageFile(event.target.files?.[0] || null)
                    }
                  />
                </div>

                {imageFile && (
                  <span className="menu-file-name">{imageFile.name}</span>
                )}

                {!imageFile && form.image_url && (
                  <span className="menu-file-name">
                    Existing image will be kept.
                  </span>
                )}
              </label>

              <label className="menu-availability">
                <input
                  name="is_available"
                  type="checkbox"
                  checked={form.is_available}
                  onChange={updateForm}
                />
                <span>
                  <strong>Available to order</strong>
                  <small>Turn off when this dish is unavailable.</small>
                </span>
              </label>

              <div className="menu-form-actions">
                <button
                  className="menu-primary-button"
                  type="submit"
                  disabled={busy}
                >
                  {busy ? (
                    <LoaderCircle size={17} className="menu-spinner" />
                  ) : (
                    <Check size={17} />
                  )}
                  {busy
                    ? "Saving..."
                    : editingItem
                      ? "Save changes"
                      : "Save menu item"}
                </button>

                {editingItem && (
                  <button
                    className="menu-secondary-button"
                    type="button"
                    onClick={resetItemForm}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          )}
        </section>

        <section className="menu-items-section">
          <div className="menu-section-heading menu-items-heading">
            <div>
              <span className="menu-eyebrow">YOUR RESTAURANT MENU</span>
              <h2>Menu items</h2>
            </div>

            <label className="menu-filter">
              <span>Category</span>
              <select
                value={filterCategory}
                onChange={(event) => setFilterCategory(event.target.value)}
              >
                <option value="all">All categories</option>
                {categories.map((category) => (
                  <option value={category.id} key={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {visibleItems.length ? (
            <div className="menu-items-grid">
              {visibleItems.map((item) => {
                const category = categories.find(
                  (entry) => entry.id === item.category_id,
                );

                return (
                  <article className="menu-item-card" key={item.id}>
                    {item.image_url ? (
                      <img
                        className="menu-item-image"
                        src={item.image_url}
                        alt={item.name}
                      />
                    ) : (
                      <div className="menu-item-image menu-item-image-empty">
                        <UtensilsCrossed size={27} />
                        <span>No photo added</span>
                      </div>
                    )}

                    <div className="menu-item-card-body">
                      <div className="menu-item-card-top">
                        <span className="menu-item-category">
                          {category?.name || "Uncategorised"}
                        </span>
                        <span
                          className={
                            item.is_available
                              ? "menu-availability-badge is-available"
                              : "menu-availability-badge is-unavailable"
                          }
                        >
                          {item.is_available ? "Available" : "Unavailable"}
                        </span>
                      </div>

                      <h3>{item.name}</h3>
                      <strong className="menu-item-price">
                        {formatPrice(item.price)}
                      </strong>

                      {item.description && (
                        <p className="menu-item-description">
                          {item.description}
                        </p>
                      )}

                      <div className="menu-item-actions">
                        <button
                          type="button"
                          className="menu-secondary-button"
                          onClick={() => startEditing(item)}
                          disabled={busy}
                        >
                          <Pencil size={15} /> Edit
                        </button>

                        <button
                          type="button"
                          className="menu-toggle-button"
                          onClick={() => toggleAvailability(item)}
                          disabled={busy}
                        >
                          {item.is_available
                            ? "Mark unavailable"
                            : "Make available"}
                        </button>

                        <button
                          type="button"
                          className="menu-delete-button"
                          aria-label={`Delete ${item.name}`}
                          title="Delete item"
                          onClick={() => deleteItem(item)}
                          disabled={busy}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="menu-empty-state">
              <div className="menu-empty-icon">
                <UtensilsCrossed size={25} />
              </div>
              <h3>
                {items.length
                  ? "No items in this category"
                  : "Your menu starts here"}
              </h3>
              <p>
                {items.length
                  ? "Choose another category to see its items."
                  : "Create a category, add your first dish and save it to your database."}
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
