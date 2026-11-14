import { useEffect, useMemo, useState } from "react";
import {
  CATEGORIES,
  PRODUCTS,
  STORE,
  type CategoryId,
  type Coupon,
  type Product,
} from "@/data/menu";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import { MenuSection } from "@/components/Menu";
import ProductModal from "@/components/ProductModal";
import CartDrawer from "@/components/CartDrawer";
import AdminPanel from "@/components/AdminPanel";
import {
  CouponBanner,
  Footer,
  HowItWorks,
  InfoCards,
} from "@/components/Footer";
import { ToastProvider, useToast } from "@/components/Toast";
import { Cart, Search, WhatsApp, X } from "@/components/Icons";
import { useCart } from "@/lib/cart";
import { SettingsProvider, statusFromSettings, useSettings } from "@/lib/settings";
import { brl, priceFrom, scrollToId } from "@/lib/utils";
import { whatsappUrl } from "@/lib/whatsapp";
import { cn } from "@/utils/cn";
import { cloudConfigured, listCatalog, createOrder } from "@/lib/cloud";

function MenuApp() {
  const toast = useToast();
  const { settings } = useSettings();
  const [menuCategories, setMenuCategories] = useState(CATEGORIES);
  const [menuProducts, setMenuProducts] = useState(PRODUCTS);

  useEffect(() => {
    if (!cloudConfigured) return;
    let alive = true;
    Promise.all([
      listCatalog<any>("categories", "select=*&active=eq.true&order=sort_order.asc"),
      listCatalog<any>("products", "select=*&active=eq.true&order=sort_order.asc"),
    ]).then(([cats, prods]) => {
      if (!alive || !cats.length || !prods.length) return;
      const mappedCats = cats.map((c:any) => ({ id:c.slug as CategoryId, label:c.name, emoji:c.emoji || "🍇", description:c.description || "" }));
      const mappedProducts = prods.filter((p:any)=>cats.some((c:any)=>c.id===p.category_id)).map((p:any) => ({ id:p.id, name:p.name, description:p.description || "", image:p.image_url || "", category:(cats.find((c:any)=>c.id===p.category_id)?.slug || "monte") as CategoryId, price:Number(p.price)||0, sizes:p.sizes || [], tags:p.tags || [], builder:Boolean(p.builder), featured:Boolean(p.featured) }));
      if (alive && mappedProducts.length) { setMenuCategories(mappedCats); setMenuProducts(mappedProducts); }
    }).catch(err=>console.warn("Catálogo na nuvem indisponível; usando cardápio local.",err));
    return () => { alive = false; };
  }, []);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = window.setInterval(tick, 30_000);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", tick);
    };
  }, []);

  const status = useMemo(
    () => statusFromSettings(settings, now),
    [settings, now],
  );

  const [query, setQuery] = useState("");
  const [active, setActive] = useState<CategoryId>("monte");
  const [cartOpen, setCartOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [modalProduct, setModalProduct] = useState<Product | null>(null);
  const [coupon, setCoupon] = useState<Coupon | null>(null);

  const activeCoupons = useMemo(
    () => settings.coupons.filter((c) => c.active),
    [settings.coupons],
  );

  // se a loja desativar o cupom aplicado, remove do carrinho
  useEffect(() => {
    if (
      coupon &&
      !settings.coupons.some((c) => c.active && c.code === coupon.code)
    ) {
      setCoupon(null);
      toast("Um cupom foi desativado pela loja");
    }
  }, [settings.coupons, coupon, toast]);

  const cart = useCart(coupon);

  // sugestões mais baratas para completar o pedido mínimo
  const suggestions = useMemo(
    () =>
      [...menuProducts]
        .sort((a, b) => priceFrom(a) - priceFrom(b))
        .slice(0, 4),
    [menuProducts],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return menuCategories.map((c) => ({ c, items: byCategory(c.id, menuProducts) }));
    return menuCategories.map((c) => ({
      c,
      items: byCategory(c.id, menuProducts).filter((p) =>
        `${p.name} ${p.description} ${(p.tags ?? []).join(" ")}`
          .toLowerCase()
          .includes(q),
      ),
    })).filter((g) => g.items.length > 0);
  }, [query, menuCategories, menuProducts]);

  useEffect(() => {
    if (query) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          );
        if (visible[0]?.target.id)
          setActive(visible[0].target.id as CategoryId);
      },
      { rootMargin: "-110px 0px -55% 0px", threshold: 0 },
    );
    menuCategories.forEach((c) => {
      const el = document.getElementById(c.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [query, menuCategories]);

  const quickAdd = (p: Product) => {
    // itens com tamanho precisam de escolha — abre o personalizador
    if (p.sizes?.length || p.builder) {
      setModalProduct(p);
      return;
    }
    cart.add({
      productId: p.id,
      title: p.name,
      image: p.image,
      unit: p.price ?? 0,
      qty: 1,
      lines: [],
    });
    toast(`${p.name} adicionado ao pedido 🎉`);
  };

  const applyCoupon = (raw: string) => {
    const found = activeCoupons.find(
      (c) => c.code === raw.trim().toUpperCase(),
    );
    if (!found) return false;
    setCoupon(found);
    return true;
  };

  const handleSend = async (message: string, payload: { items: import("@/lib/cart").CartItem[]; checkout: import("@/lib/whatsapp").Checkout; subtotal: number; discount: number; deliveryFee: number; total: number; couponCode?: string }) => {
    if (cloudConfigured) {
      const c = payload.checkout;
      const address = c.mode === "delivery" ? [c.street, c.number, c.complement, c.neighborhood, c.reference ? `Ref.: ${c.reference}` : ""].filter(Boolean).join(", ") : "Retirada no balcão";
      const details = [
        `Pagamento: ${{pix:"Pix",credito:"Cartão de crédito",debito:"Cartão de débito",dinheiro:"Dinheiro"}[c.payment]}`,
        c.payment === "dinheiro" && c.change ? `Troco para: R$ ${c.change}` : "",
        c.when === "scheduled" && c.schedule ? `Agendado para: ${c.schedule}` : "Preparar o quanto antes",
      ].filter(Boolean).join(" · ");
      const notes = [c.notes, details].filter(Boolean).join("\n");
      try {
        await createOrder({
          customer_name: c.name, customer_phone: c.phone, fulfillment: c.mode === "delivery" ? "delivery" : "pickup",
          delivery_address: address, notes,
          items: payload.items.map(i => ({ name: i.title, product_id: i.productId, quantity: i.qty, unit_price: i.unit, total: i.qty * i.unit, options: i.lines, note: i.note || "" })),
          subtotal: payload.subtotal, discount: payload.discount, delivery_fee: payload.deliveryFee, total: payload.total, coupon_code: payload.couponCode || null, status: "received",
          customer_details: { payment: c.payment, change: c.change, scheduled: c.when === "scheduled", schedule: c.schedule, neighborhood: c.neighborhood, complement: c.complement, reference: c.reference }
        });
      } catch (error) {
        console.error("Não foi possível registrar o pedido na nuvem", error);
        toast("Não consegui registrar o pedido na nuvem. Confira a conexão e tente novamente.");
        return;
      }
    }
    window.open(
      whatsappUrl(message, settings.whatsapp),
      "_blank",
      "noopener,noreferrer",
    );
    cart.clear();
    setCartOpen(false);
    toast("Pedido enviado no WhatsApp! 🚀");
  };

  return (
    <div className="min-h-screen">
      <Header
        count={cart.totals.count}
        onOpenCart={() => setCartOpen(true)}
        query={query}
        onQuery={setQuery}
        open={status.open}
        statusText={status.text}
      />

      {!status.open && (
        <div className="bg-mango-400 px-4 py-2.5 text-center text-[13px] font-bold text-acai-950">
          Estamos fechados agora —{" "}
          {status.text.toLowerCase().replace("fechado · ", "")}. Você pode
          montar seu pedido e agendar a entrega! 💜
        </div>
      )}

      <Hero
        open={status.open}
        statusText={status.text}
        today={status.today}
      />

      {/* navegação de categorias */}
      <nav className="sticky top-[68px] z-30 border-b border-acai-100 bg-acai-50/90 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-4">
          <div className="no-scrollbar flex gap-2 overflow-x-auto py-3">
            <button
              onClick={() => {
                setQuery("");
                setTimeout(() => scrollToId("cardapio"), 30);
              }}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-bold transition",
                Boolean(query)
                  ? "bg-acai-800 text-white shadow-md shadow-acai-700/25"
                  : "bg-white text-acai-700 ring-1 ring-acai-100 hover:bg-white/70",
              )}
            >
              🔥 Tudo
            </button>
            {menuCategories.map((c) => (
              <button
                key={c.id}
                onClick={() => scrollToId(c.id)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-bold transition",
                  active === c.id
                    ? "bg-acai-800 text-white shadow-md shadow-acai-700/25"
                    : "bg-white text-acai-700 ring-1 ring-acai-100 hover:bg-white/70",
                )}
              >
                <span className="text-base">{c.emoji}</span>
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* busca mobile */}
      <div className="mx-auto max-w-6xl px-4 pt-6 md:hidden">
        <label className="flex items-center gap-2 rounded-full border border-acai-200 bg-white px-4 py-3 text-sm shadow-sm">
          <Search width={17} height={17} className="text-acai-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar no cardápio…"
            className="w-full bg-transparent font-semibold outline-none placeholder:font-medium placeholder:text-acai-400"
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label="Limpar busca">
              <X width={16} height={16} className="text-acai-400" />
            </button>
          )}
        </label>
      </div>

      <main id="cardapio" className="mx-auto max-w-6xl px-4">
        <HowItWorks />

        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-4xl">🔍</p>
            <h3 className="mt-3 text-lg font-extrabold text-acai-950">
              Nada encontrado para “{query}”
            </h3>
            <p className="mt-1 text-sm text-acai-900/60">
              Tente buscar por “açaí”, “combo”, “suco” ou “coxinha”.
            </p>
            <button
              onClick={() => setQuery("")}
              className="mt-4 rounded-full bg-acai-700 px-6 py-3 text-sm font-bold text-white transition hover:bg-acai-800"
            >
              Ver cardápio completo
            </button>
          </div>
        ) : (
          filtered.map(({ c, items }) => (
            <MenuSection
              key={c.id}
              category={c}
              products={items}
              onOpen={setModalProduct}
              onQuickAdd={quickAdd}
            />
          ))
        )}

        <CouponBanner />
        <InfoCards />
      </main>

      <Footer
        onOpenCart={() => setCartOpen(true)}
        onOpenAdmin={() => setAdminOpen(true)}
      />

      {/* barra flutuante mobile */}
      {cart.totals.count > 0 && !cartOpen && !modalProduct && !adminOpen && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-acai-100 bg-white/95 p-3 backdrop-blur-xl sm:hidden">
          <button
            onClick={() => setCartOpen(true)}
            className="flex w-full items-center gap-3 rounded-full bg-acai-800 px-5 py-3.5 text-white shadow-xl shadow-acai-800/25 active:scale-[0.98]"
          >
            <span className="relative">
              <Cart width={20} height={20} />
              <span className="absolute -right-2 -top-2 grid h-4 min-w-4 place-items-center rounded-full bg-lime-acai px-1 text-[10px] font-extrabold text-acai-950">
                {cart.totals.count}
              </span>
            </span>
            <span className="text-left text-sm font-extrabold">
              Ver pedido · {brl(cart.totals.total)}
            </span>
            <span className="ml-auto text-[11px] font-bold text-lime-acai">
              enviar no WhatsApp →
            </span>
          </button>
        </div>
      )}

      {/* botão flutuante do whatsapp */}
      {!cartOpen && !modalProduct && !adminOpen && (
        <a
          href={whatsappUrl(
            `Oi, ${STORE.name}! Tenho uma dúvida sobre o cardápio 💜`,
            settings.whatsapp,
          )}
          target="_blank"
          rel="noreferrer"
          aria-label="Falar no WhatsApp"
          className={cn(
            "fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-2xl shadow-emerald-600/30 transition hover:scale-105 active:scale-95",
            cart.totals.count > 0 ? "bottom-24 sm:bottom-6" : "bottom-6",
          )}
        >
          <WhatsApp width={26} height={26} />
        </a>
      )}

      {modalProduct && (
        <ProductModal
          key={modalProduct.id}
          product={modalProduct}
          onClose={() => setModalProduct(null)}
          onAdd={(payload) => {
            cart.add(payload);
            toast(`${payload.title} adicionado ao pedido 🎉`);
          }}
        />
      )}

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        items={cart.items}
        setQty={cart.setQty}
        remove={cart.remove}
        clear={cart.clear}
        subtotal={cart.totals.subtotal}
        discount={cart.totals.discount}
        coupon={coupon}
        coupons={activeCoupons}
        minOrder={settings.minOrder}
        freeDeliveryFrom={settings.freeDeliveryFrom}
        applyCoupon={applyCoupon}
        removeCoupon={() => setCoupon(null)}
        openNow={status.open}
        suggestions={suggestions}
        onQuickAdd={quickAdd}
        onSend={handleSend}
      />

      <AdminPanel open={adminOpen} onClose={() => setAdminOpen(false)} />
    </div>
  );
}

function byCategory(id: CategoryId, products: Product[] = PRODUCTS) {
  return products.filter((p) => p.category === id);
}

export default function App() {
  return (
    <ToastProvider>
      <SettingsProvider>
        <MenuApp />
      </SettingsProvider>
    </ToastProvider>
  );
}
