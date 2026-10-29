import { useCallback, useEffect, useState } from "react";
import { ImagePlus, LoaderCircle, Pencil, Plus, RefreshCw, Save, Tag, ToggleLeft, ToggleRight, Trash2, Upload, X } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import "./MenuBannersDashboard.css";

const BUCKET = "menu-images";
const MAX_BANNERS = 5;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const EMPTY_FORM = { id: "", image_path: "", display_mode: "text_overlay", eyebrow: "FROM OUR KITCHEN", title: "", description: "", sort_order: "0", is_active: true };

function publicImageUrl(path) {
  return path ? supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : "";
}

function safeFileName(name) {
  return name.toLowerCase().replace(/[^a-z0-9._-]/g, "-").slice(-90) || "banner.webp";
}

export default function MenuBannersDashboard() {
  const [restaurants, setRestaurants] = useState([]);
  const [restaurantId, setRestaurantId] = useState("");
  const [userId, setUserId] = useState("");
  const [banners, setBanners] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyBannerId, setBusyBannerId] = useState("");
  const [confirmRemoveId, setConfirmRemoveId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadBanners = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData?.user) throw new Error("Sign in to manage menu banners.");
      setUserId(authData.user.id);
      const { data: owned, error: restaurantError } = await supabase
        .from("restaurants").select("id, name").eq("owner_id", authData.user.id).order("name");
      if (restaurantError) throw restaurantError;
      const ownedRows = owned || [];
      setRestaurants(ownedRows);
      const chosenId = ownedRows.some((row) => row.id === restaurantId) ? restaurantId : ownedRows[0]?.id || "";
      if (chosenId !== restaurantId) setRestaurantId(chosenId);
      if (!chosenId) { setBanners([]); return; }
      const { data, error: bannerError } = await supabase.from("restaurant_menu_banners")
        .select("id, restaurant_id, image_path, display_mode, eyebrow, title, description, sort_order, is_active, created_at")
        .eq("restaurant_id", chosenId).order("sort_order").order("created_at", { ascending: false });
      if (bannerError) throw bannerError;
      const rows = data || [];
      setBanners(rows);
      setForm((current) => {
        if (current.id) return current;
        const freeSlot = Array.from({ length: MAX_BANNERS }, (_, index) => index).find((index) => !rows.some((banner) => banner.sort_order === index));
        return { ...current, sort_order: String(freeSlot ?? 0) };
      });
    } catch (loadError) {
      console.error("Could not load menu banners:", loadError);
      setError(loadError?.message || "Could not load menu banners.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [restaurantId]);

  useEffect(() => { void loadBanners(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!restaurantId || loading) return;
    setForm(EMPTY_FORM);
    setImageFile(null);
    setImagePreview("");
    void loadBanners(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);
  useEffect(() => () => { if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview); }, [imagePreview]);

  function pickImage(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPG, PNG or WebP image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) { setError("Banner image must be 5 MB or smaller."); return; }
    setError("");
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function startEdit(banner) {
    setError(""); setNotice("");
    setForm({ id: banner.id, image_path: banner.image_path, display_mode: banner.display_mode || "text_overlay", eyebrow: banner.eyebrow || "", title: banner.title || "", description: banner.description || "", sort_order: String(banner.sort_order), is_active: banner.is_active });
    setImageFile(null);
    setImagePreview(publicImageUrl(banner.image_path));
    document.getElementById("menu-banner-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetForm() {
    const freeSlot = Array.from({ length: MAX_BANNERS }, (_, index) => index).find((index) => !banners.some((banner) => banner.sort_order === index));
    setForm({ ...EMPTY_FORM, sort_order: String(freeSlot ?? 0) }); setImageFile(null); setImagePreview(""); setError("");
  }

  async function saveBanner(event) {
    event.preventDefault();
    if (!restaurantId || !userId || saving) return;
    setError(""); setNotice("");
    const eyebrow = form.eyebrow.trim();
    const title = form.title.trim();
    const description = form.description.trim();
    const sortOrder = Number(form.sort_order);
    if (form.display_mode === "text_overlay" && (eyebrow.length < 2 || eyebrow.length > 32)) { setError("Short label must be 2–32 characters."); return; }
    if (form.display_mode === "text_overlay" && (title.length < 2 || title.length > 80)) { setError("Banner heading must be 2–80 characters."); return; }
    if (description.length > 140) { setError("Description must be 140 characters or less."); return; }
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder >= MAX_BANNERS) { setError("Choose a banner position from 1 to 5."); return; }
    if (banners.some((banner) => banner.sort_order === sortOrder && banner.id !== form.id)) { setError("Another banner already uses that position. Choose a different one."); return; }
    if (!form.id && !imageFile) { setError("Upload an image for this banner."); return; }

    setSaving(true);
    let uploadedPath = "";
    try {
      let imagePath = form.image_path;
      if (imageFile) {
        uploadedPath = `${userId}/${restaurantId}/banners/${crypto.randomUUID()}-${safeFileName(imageFile.name)}`;
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(uploadedPath, imageFile, {
          cacheControl: "3600", contentType: imageFile.type, upsert: false,
        });
        if (uploadError) throw uploadError;
        imagePath = uploadedPath;
      }
      const payload = { restaurant_id: restaurantId, image_path: imagePath, display_mode: form.display_mode, eyebrow: form.display_mode === "image_only" ? "" : eyebrow, title: form.display_mode === "image_only" ? "" : title, description: form.display_mode === "image_only" ? "" : description, sort_order: sortOrder, is_active: form.is_active };
      const query = form.id
        ? supabase.from("restaurant_menu_banners").update(payload).eq("id", form.id).eq("restaurant_id", restaurantId)
        : supabase.from("restaurant_menu_banners").insert(payload);
      const { error: saveError } = await query;
      if (saveError) throw saveError;
      if (form.id && uploadedPath && form.image_path) {
        const { error: cleanupError } = await supabase.storage.from(BUCKET).remove([form.image_path]);
        if (cleanupError) console.warn("Could not remove replaced banner image:", cleanupError);
      }
      resetForm();
      setNotice(form.id ? "Banner updated." : "Banner added to your public menu.");
      await loadBanners(true);
    } catch (saveError) {
      if (uploadedPath) await supabase.storage.from(BUCKET).remove([uploadedPath]);
      setError(saveError?.message || "Could not save this banner.");
    } finally { setSaving(false); }
  }

  async function toggleBanner(banner) {
    setBusyBannerId(banner.id); setError(""); setNotice("");
    const { error: updateError } = await supabase.from("restaurant_menu_banners").update({ is_active: !banner.is_active }).eq("id", banner.id).eq("restaurant_id", restaurantId);
    if (updateError) setError(updateError.message || "Could not update the banner.");
    else { setBanners((current) => current.map((entry) => entry.id === banner.id ? { ...entry, is_active: !entry.is_active } : entry)); setNotice(`${banner.title} ${banner.is_active ? "hidden" : "shown"} on the public menu.`); }
    setBusyBannerId("");
  }

  async function removeBanner(banner) {
    if (busyBannerId) return;
    setBusyBannerId(banner.id); setError(""); setNotice("");
    const { error: deleteError } = await supabase.from("restaurant_menu_banners").delete().eq("id", banner.id).eq("restaurant_id", restaurantId);
    if (deleteError) { setError(deleteError.message || "Could not remove the banner."); setBusyBannerId(""); return; }
    const { error: storageError } = await supabase.storage.from(BUCKET).remove([banner.image_path]);
    if (storageError) console.warn("Could not remove banner image:", storageError);
    setBanners((current) => current.filter((entry) => entry.id !== banner.id));
    setNotice("Banner removed from your public menu.");
    setConfirmRemoveId("");
    if (form.id === banner.id) {
      const freeSlot = Array.from({ length: MAX_BANNERS }, (_, index) => index).find((index) => index === banner.sort_order || !banners.some((entry) => entry.sort_order === index));
      setForm({ ...EMPTY_FORM, sort_order: String(freeSlot ?? 0) }); setImageFile(null); setImagePreview("");
    }
    setBusyBannerId("");
  }

  const previewImage = imagePreview || (form.image_path ? publicImageUrl(form.image_path) : "");

  return (
    <main className="menu-banners-page">
      <header className="menu-banners-header">
        <div><span className="menu-banners-eyebrow"><ImagePlus size={14} /> PUBLIC MENU DESIGN</span><h1>Menu banners</h1><p>Upload the photos and text customers see in your menu slider.</p></div>
        <div className="menu-banners-header-actions">
          {restaurants.length > 1 && <label><span>Restaurant</span><select value={restaurantId} onChange={(event) => setRestaurantId(event.target.value)}>{restaurants.map((restaurant) => <option value={restaurant.id} key={restaurant.id}>{restaurant.name}</option>)}</select></label>}
          <button type="button" onClick={() => void loadBanners(true)} disabled={refreshing}><RefreshCw size={15} className={refreshing ? "menu-banners-spin" : ""} /> Refresh</button>
        </div>
      </header>
      {error && <div className="menu-banners-message is-error" role="alert">{error}</div>}
      {notice && <div className="menu-banners-message is-success" role="status">{notice}</div>}
      {!loading && restaurants.length === 0 ? <section className="menu-banners-empty"><ImagePlus size={26} /><h2>Set up your restaurant first</h2><p>Create a restaurant profile before adding public menu banners.</p></section> : (
        <div className="menu-banners-layout">
          <section className="menu-banners-panel" id="menu-banner-editor">
            <div className="menu-banners-panel-heading"><span><Plus size={17} /></span><div><h2>{form.id ? "Edit banner" : "Add a banner"}</h2><p>{banners.length} of {MAX_BANNERS} banner slots used</p></div></div>
            <form className="menu-banner-form" onSubmit={saveBanner}>
              <label className="menu-banner-upload"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={pickImage} /><Upload size={17} /><span>{imageFile ? imageFile.name : previewImage ? "Replace banner image" : "Upload JPG, PNG or WebP"}</span><small>Recommended 16:9 · up to 5 MB</small></label>
              <div className={`menu-banner-preview${previewImage ? " has-image" : ""}${form.display_mode === "image_only" ? " is-image-only" : ""}`} style={previewImage ? { backgroundImage: `${form.display_mode === "text_overlay" ? "linear-gradient(90deg,rgba(0,52,38,.96),rgba(0,52,38,.69) 53%,rgba(0,52,38,.04))," : ""}url("${previewImage}")` } : undefined}>
                {previewImage ? form.display_mode === "image_only" ? null : <><span>{form.eyebrow || "YOUR BANNER"}</span><strong>{form.title || "Your headline goes here"}</strong><p>{form.description || "A short line that invites guests to explore."}</p></> : <span className="menu-banner-placeholder"><ImagePlus size={24} />Live preview will appear here</span>}
              </div>
              <div className="menu-banner-fields">
                <fieldset className="menu-banner-display-mode"><legend>Banner style</legend><label><input type="radio" name="banner-display-mode" value="text_overlay" checked={form.display_mode === "text_overlay"} onChange={() => setForm((current) => ({ ...current, display_mode: "text_overlay" }))} /><span>Text over image</span></label><label><input type="radio" name="banner-display-mode" value="image_only" checked={form.display_mode === "image_only"} onChange={() => setForm((current) => ({ ...current, display_mode: "image_only" }))} /><span>Full image, no text</span></label></fieldset>
                {form.display_mode === "text_overlay" && <>
                  <label><span>Small label</span><input value={form.eyebrow} maxLength={32} onChange={(event) => setForm((current) => ({ ...current, eyebrow: event.target.value }))} required /></label>
                  <label><span>Headline</span><input value={form.title} maxLength={80} placeholder="Fresh favourites, just for you" onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} required /></label>
                  <label><span>Description</span><textarea value={form.description} maxLength={140} rows={2} placeholder="Browse the menu and find your next favourite." onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label>
                </>}
                <div className="menu-banner-fields-row">
                  <label><span>Slider position</span><select value={form.sort_order} onChange={(event) => setForm((current) => ({ ...current, sort_order: event.target.value }))}>{Array.from({ length: MAX_BANNERS }, (_, index) => <option value={index} key={index} disabled={banners.some((banner) => banner.sort_order === index && banner.id !== form.id)}>Banner {index + 1}</option>)}</select></label>
                  <label className="menu-banner-active"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))} /><span>Show on public menu</span></label>
                </div>
              </div>
              <div className="menu-banner-form-actions"><button className="menu-banner-save" type="submit" disabled={saving || loading || !restaurantId || (!form.id && banners.length >= MAX_BANNERS)}>{saving ? <LoaderCircle size={16} className="menu-banners-spin" /> : form.id ? <Save size={16} /> : <Plus size={16} />}{form.id ? "Save changes" : "Add to slider"}</button>{form.id && <button type="button" className="menu-banner-cancel" onClick={resetForm} disabled={saving}><X size={15} /> Cancel</button>}</div>
              {!form.id && banners.length >= MAX_BANNERS && <p className="menu-banner-limit">All five banner slots are in use. Edit an existing banner to replace it.</p>}
            </form>
          </section>

          <section className="menu-banners-panel menu-banners-list-panel">
            <div className="menu-banners-panel-heading"><span className="is-gold"><Tag size={17} /></span><div><h2>Your slider</h2><p>Active banners rotate on the public menu.</p></div><strong className="menu-banners-count">{banners.filter((banner) => banner.is_active).length}</strong></div>
            {loading ? <div className="menu-banners-empty compact"><LoaderCircle size={22} className="menu-banners-spin" /> Loading banners…</div> : banners.length === 0 ? <div className="menu-banners-empty compact"><ImagePlus size={24} /><strong>No uploaded banners yet</strong><p>Your current menu photos remain in the slider until you add banners.</p></div> : (
              <div className="menu-banners-list">{banners.map((banner) => <article className={`menu-banner-card${banner.is_active ? " is-active" : ""}`} key={banner.id}>
                <img src={publicImageUrl(banner.image_path)} alt="" />
                <div className="menu-banner-card-copy"><span>Banner {banner.sort_order + 1} · {banner.display_mode === "image_only" ? "Full image" : banner.eyebrow}</span><strong>{banner.display_mode === "image_only" ? "Image only" : banner.title}</strong><small>{banner.display_mode === "image_only" ? "No text overlay" : banner.description || "No description"}</small></div>
                <div className="menu-banner-card-actions">{confirmRemoveId === banner.id ? <><span className="menu-banner-remove-prompt">Remove?</span><button type="button" aria-label={`Confirm remove ${banner.title}`} disabled={busyBannerId === banner.id} onClick={() => void removeBanner(banner)}><Trash2 size={15} /></button><button type="button" aria-label="Cancel removal" onClick={() => setConfirmRemoveId("")}>Cancel</button></> : <><button type="button" aria-label={`Edit ${banner.title}`} onClick={() => startEdit(banner)}><Pencil size={15} /></button><button type="button" aria-label={`${banner.is_active ? "Hide" : "Show"} ${banner.title}`} disabled={busyBannerId === banner.id} onClick={() => void toggleBanner(banner)}>{banner.is_active ? <ToggleRight size={23} /> : <ToggleLeft size={23} />}</button><button type="button" aria-label={`Remove ${banner.title}`} disabled={busyBannerId === banner.id} onClick={() => setConfirmRemoveId(banner.id)}><Trash2 size={15} /></button></>}</div>
              </article>)}</div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
