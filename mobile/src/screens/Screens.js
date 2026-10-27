import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable,
  RefreshControl, ScrollView, StyleSheet, Text, TextInput, View
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api, { apiErrorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';

const C = { navy: '#101d32', orange: '#f28b20', pale: '#fff4e5', ink: '#172033', gray: '#687385', line: '#e6e8eb', bg: '#f2f4f7', green: '#16834b', white: '#fff' };
const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const firstImage = (item) => item?.images?.[0]?.url || item?.image_url || '';

function Button({ title, onPress, secondary, disabled, style }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={[styles.button, secondary && styles.buttonSecondary, disabled && { opacity: 0.55 }, style]}>
      <Text style={[styles.buttonText, secondary && styles.buttonSecondaryText]}>{title}</Text>
    </Pressable>
  );
}

function ErrorBox({ message, onRetry }) {
  if (!message) return null;
  return <View style={styles.errorBox}><Text style={styles.errorText}>{message}</Text>{onRetry ? <Pressable onPress={onRetry}><Text style={styles.link}>Try again</Text></Pressable> : null}</View>;
}

function Loading({ label = 'Loading...' }) {
  return <View style={styles.loading}><ActivityIndicator color={C.orange} size="large" /><Text style={styles.muted}>{label}</Text></View>;
}

function Header({ navigation, cart = true }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <Pressable onPress={() => navigation.navigate('Store', { screen: 'Home' })}><Text style={styles.brand}>shopkart<Text style={styles.brandDot}>.</Text></Text></Pressable>
        {cart && <Pressable onPress={() => navigation.navigate('Store', { screen: 'Cart' })} style={styles.cartHead}><Text style={{ fontSize: 21 }}>🛒</Text></Pressable>}
      </View>
      <Pressable style={styles.delivery} onPress={() => navigation.navigate('Addresses')}>
        <Text style={{ color: C.white, fontSize: 13 }}>⌖  Deliver to {useAuth().user?.name || 'your location'}  ›</Text>
      </Pressable>
      <Pressable style={styles.searchBar} onPress={() => navigation.navigate('Search')}>
        <Text style={{ fontSize: 17 }}>⌕</Text><Text style={styles.searchHint}>Search ShopKart</Text>
        <Text style={{ fontSize: 17, marginRight: 8 }}>🎙</Text>
      </Pressable>
    </View>
  );
}

function ProductCard({ item, navigation }) {
  const discount = item.compare_at_price && Number(item.compare_at_price) > Number(item.price)
    ? Math.round((1 - Number(item.price) / Number(item.compare_at_price)) * 100) : 0;
  return (
    <Pressable style={styles.productCard} onPress={() => navigation.navigate('Product', { productId: item.id })}>
      {firstImage(item) ? <Image source={{ uri: firstImage(item) }} style={styles.productImage} resizeMode="cover" /> :
        <View style={[styles.productImage, styles.imagePlaceholder]}><Text style={{ fontSize: 30 }}>🛍️</Text></View>}
      {discount > 0 ? <Text style={styles.discountPill}>{discount}% off</Text> : null}
      <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
      <Text style={styles.rating}>★ {Number(item.rating || 0).toFixed(1)} <Text style={styles.muted}>({item.review_count || 0})</Text></Text>
      <Text style={styles.productPrice}>{money(item.price)}</Text>
      <Text style={styles.mutedSmall}>FREE delivery on eligible orders</Text>
    </Pressable>
  );
}

function ProductGrid({ products, navigation }) {
  return <View style={styles.productGrid}>{products.map((item) => <ProductCard key={item.id} item={item} navigation={navigation} />)}</View>;
}

async function payWithRazorpay(order, user) {
  const intent = await api.post(`/orders/${order.id}/payment-intent`);
  const payment = intent.data.payment;
  const checkout = require('react-native-razorpay').default;
  const result = await checkout.open({
    key: payment.key_id, order_id: payment.provider_order_id,
    amount: Math.round(Number(payment.amount) * 100), currency: payment.currency,
    name: 'ShopKart', description: `Order #${order.id}`,
    prefill: { name: user?.name, email: user?.email }
  });
  const verified = await api.post(`/orders/${order.id}/verify-payment`, {
    razorpay_order_id: result.razorpay_order_id,
    razorpay_payment_id: result.razorpay_payment_id,
    razorpay_signature: result.razorpay_signature
  });
  return verified.data.order;
}

function Screen({ navigation, children, noHeader = false, cart = true, contentStyle }) {
  return <View style={styles.screen}>{!noHeader && <Header navigation={navigation} cart={cart} />}{children}</View>;
}

export function SplashScreen({ navigation }) {
  const { user } = useAuth();
  return (
    <View style={styles.splash}>
      <View style={styles.splashTop}><Text style={styles.brandLarge}>shopkart<Text style={styles.brandDot}>.</Text></Text><Text style={styles.splashTag}>Everything you love, delivered.</Text></View>
      <View style={styles.splashIllustration}><Text style={{ fontSize: 82 }}>🛍️</Text><Text style={styles.splashCaption}>Discover more. Shop smarter.</Text></View>
      <View style={styles.splashActions}>
        <Button title={user ? 'Start shopping' : 'Continue to ShopKart'} onPress={() => navigation.replace('Store')} />
        {!user && <Button title="Sign in or create an account" secondary onPress={() => navigation.navigate('Login')} />}
        <Text style={styles.splashFoot}>A little something for every day.</Text>
      </View>
    </View>
  );
}

function AuthForm({ navigation, register = false }) {
  const { signIn } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit() {
    setError('');
    if (!email.trim() || !password || (register && !name.trim())) return setError('Please complete all required fields.');
    if (register && password.length < 8) return setError('Password must be at least 8 characters.');
    setBusy(true);
    try {
      await signIn(register ? '/auth/register' : '/auth/login', register ? { name, email, password } : { email, password });
      navigation.reset({ index: 0, routes: [{ name: 'Store' }] });
    } catch (requestError) { setError(apiErrorMessage(requestError)); }
    finally { setBusy(false); }
  }
  return (
    <Screen navigation={navigation} noHeader>
      <View style={styles.authTop}><Pressable onPress={() => navigation.goBack()}><Text style={styles.back}>‹</Text></Pressable><Text style={styles.brand}>shopkart<Text style={styles.brandDot}>.</Text></Text></View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.authContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{register ? 'Create your account' : 'Welcome back'}</Text>
          <Text style={styles.muted}>{register ? 'Sign up to save your favourites and track orders.' : 'Sign in to continue shopping.'}</Text>
          {register && <TextInput style={styles.input} placeholder="Full name" value={name} onChangeText={setName} autoCapitalize="words" />}
          <TextInput style={styles.input} placeholder="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          <TextInput style={styles.input} placeholder="Password (8 characters minimum)" value={password} onChangeText={setPassword} secureTextEntry />
          <ErrorBox message={error} />
          <Button title={busy ? 'Please wait...' : register ? 'Create account' : 'Sign in'} onPress={submit} disabled={busy} style={{ marginTop: 12 }} />
          <Pressable onPress={() => navigation.replace(register ? 'Login' : 'Register')} style={{ marginTop: 22 }}>
            <Text style={styles.muted}>{register ? 'Already have an account? ' : 'New to ShopKart? '}<Text style={styles.link}>{register ? 'Sign in' : 'Create an account'}</Text></Text>
          </Pressable>
          <Pressable onPress={() => navigation.replace('Store')} style={{ marginTop: 22 }}><Text style={styles.muted}>Continue browsing as guest</Text></Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

export function LoginScreen(props) { return <AuthForm {...props} />; }
export function RegisterScreen(props) { return <AuthForm {...props} register />; }

export function HomeScreen({ navigation }) {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const [categoryResult, productResult] = await Promise.all([api.get('/categories'), api.get('/products', { params: { limit: 12, sort: 'rating' } })]);
      setCategories(categoryResult.data.categories); setProducts(productResult.data.products);
    } catch (requestError) { setError(apiErrorMessage(requestError)); }
    finally { setBusy(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  return (
    <Screen navigation={navigation}>
      <ScrollView refreshControl={<RefreshControl refreshing={busy} onRefresh={load} tintColor={C.orange} />}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryStrip}>
          {categories.map((category) => <Pressable key={category.id} style={styles.categoryChip} onPress={() => navigation.navigate('Search', { categoryId: category.id, categoryName: category.name })}>
            <Text style={styles.categoryIcon}>{category.icon}</Text><Text style={styles.categoryLabel}>{category.name}</Text>
          </Pressable>)}
        </ScrollView>
        <Pressable onPress={() => navigation.navigate('Search')} style={styles.hero}>
          <Text style={styles.heroEyebrow}>SHOP THE EVERYDAY EDIT</Text><Text style={styles.heroTitle}>Good finds.{'\n'}Great prices.</Text>
          <Text style={styles.heroCopy}>Fresh picks for your home, style and routine.</Text><Text style={styles.heroCta}>Explore deals  ›</Text>
          <Text style={styles.heroBag}>🛍️</Text>
        </Pressable>
        <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Top picks for you</Text><Pressable onPress={() => navigation.navigate('Search')}><Text style={styles.link}>See all</Text></Pressable></View>
        {error ? <ErrorBox message={error} onRetry={load} /> : busy ? <Loading label="Finding today's picks..." /> : products.length
          ? <ProductGrid products={products} navigation={navigation} /> : <Text style={styles.emptyText}>No products yet. Please check back soon.</Text>}
        <View style={styles.promoSmall}><Text style={{ fontSize: 24 }}>🚚</Text><View style={{ flex: 1 }}><Text style={styles.bold}>Easy, reliable delivery</Text><Text style={styles.mutedSmall}>Free delivery on orders over ₹999</Text></View></View>
      </ScrollView>
    </Screen>
  );
}

export function CategoriesScreen({ navigation }) {
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const load = useCallback(() => api.get('/categories').then((r) => { setCategories(r.data.categories); setError(''); }).catch((e) => setError(apiErrorMessage(e))), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  return <Screen navigation={navigation}><ScrollView contentContainerStyle={styles.pagePad}>
    <Text style={styles.title}>Shop by category</Text><Text style={styles.muted}>Find something you’ll love.</Text>
    <ErrorBox message={error} onRetry={load} />
    {categories.map((item) => <Pressable key={item.id} style={styles.categoryRow} onPress={() => navigation.navigate('Search', { categoryId: item.id, categoryName: item.name })}>
      <Text style={styles.categoryRowIcon}>{item.icon}</Text><View style={{ flex: 1 }}><Text style={styles.bold}>{item.name}</Text><Text style={styles.mutedSmall}>{item.product_count} products</Text></View><Text style={styles.muted}>›</Text>
    </Pressable>)}
    {!categories.length && !error && <Loading />}
  </ScrollView></Screen>;
}

export function SearchScreen({ navigation, route }) {
  const [text, setText] = useState(route.params?.query || '');
  const [submittedText, setSubmittedText] = useState(route.params?.query || '');
  const [sort, setSort] = useState('relevance');
  const [products, setProducts] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [appliedMinPrice, setAppliedMinPrice] = useState('');
  const [appliedMaxPrice, setAppliedMaxPrice] = useState('');
  const categoryId = route.params?.categoryId;
  const load = useCallback(async (nextPage = 1) => {
    setBusy(true); setError('');
    try {
      const response = await api.get('/products', { params: {
        q: submittedText || undefined, category: categoryId, sort, page: nextPage, limit: 20,
        minPrice: appliedMinPrice || undefined, maxPrice: appliedMaxPrice || undefined
      } });
      setProducts(response.data.products); setPage(nextPage); setPages(response.data.pagination.pages);
    } catch (requestError) { setError(apiErrorMessage(requestError)); }
    finally { setBusy(false); }
  }, [submittedText, categoryId, sort, appliedMinPrice, appliedMaxPrice]);
  useEffect(() => {
    const queryText = route.params?.query || '';
    setText(queryText);
    setSubmittedText(queryText.trim());
  }, [route.params?.query]);
  useEffect(() => { load(1); }, [load]);
  function submitSearch() {
    const queryText = text.trim();
    if (queryText === submittedText) load(1);
    else setSubmittedText(queryText);
  }
  function applyPriceFilter() {
    setAppliedMinPrice(minPrice);
    setAppliedMaxPrice(maxPrice);
  }
  return (
    <Screen navigation={navigation}>
      <View style={styles.searchControls}>
        <View style={styles.searchInputRow}><TextInput value={text} onChangeText={setText} onSubmitEditing={submitSearch} returnKeyType="search" placeholder="Search products" style={styles.searchInput} /><Pressable onPress={submitSearch}><Text style={styles.link}>Search</Text></Pressable></View>
        <Text style={styles.mutedSmall}>{route.params?.categoryName || 'Shop all products'} · Sort by</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {[['relevance', 'Featured'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['rating', 'Top rated'], ['newest', 'Newest']].map(([value, label]) =>
            <Pressable key={value} onPress={() => setSort(value)} style={[styles.sortChip, sort === value && styles.sortChipActive]}><Text style={[styles.sortText, sort === value && styles.sortTextActive]}>{label}</Text></Pressable>)}
        </ScrollView>
        <View style={styles.priceRow}><TextInput style={styles.priceInput} value={minPrice} onChangeText={setMinPrice} placeholder="Min ₹" keyboardType="numeric" /><TextInput style={styles.priceInput} value={maxPrice} onChangeText={setMaxPrice} placeholder="Max ₹" keyboardType="numeric" /><Button title="Apply" onPress={applyPriceFilter} style={styles.applyButton} /></View>
      </View>
      <ScrollView contentContainerStyle={styles.searchResults}>
        {error ? <ErrorBox message={error} onRetry={() => load(page)} /> : busy ? <Loading /> : products.length ?
          <><ProductGrid products={products} navigation={navigation} /><View style={styles.pagination}><Button title="Previous" secondary disabled={page <= 1} onPress={() => load(page - 1)} /><Text style={styles.muted}>Page {page} of {Math.max(1, pages)}</Text><Button title="Next" secondary disabled={page >= pages} onPress={() => load(page + 1)} /></View></> :
          <View style={styles.empty}><Text style={{ fontSize: 38 }}>🔎</Text><Text style={styles.bold}>No products found</Text><Text style={styles.muted}>Try a different search or price range.</Text></View>}
      </ScrollView>
    </Screen>
  );
}

export function ProductScreen({ navigation, route }) {
  const { user } = useAuth();
  const [product, setProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [imageIndex, setImageIndex] = useState(0);
  const [busy, setBusy] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setBusy(true); setError('');
    try { const response = await api.get(`/products/${route.params.productId}`); setProduct(response.data.product); }
    catch (requestError) { setError(apiErrorMessage(requestError)); }
    finally { setBusy(false); }
  }, [route.params.productId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  async function addToCart() {
    if (!user) return navigation.navigate('Login');
    setWorking(true);
    try { await api.post('/cart/items', { product_id: product.id, quantity }); return true; }
    catch (requestError) { setError(apiErrorMessage(requestError)); return false; }
    finally { setWorking(false); }
  }
  async function saveToWishlist() {
    if (!user) return navigation.navigate('Login');
    try { await api.post(`/wishlist/${product.id}`); Alert.alert('Saved', 'Added to your wishlist.'); }
    catch (requestError) { setError(apiErrorMessage(requestError)); }
  }
  return <Screen navigation={navigation}><ScrollView contentContainerStyle={styles.detailPage}>
    {busy ? <Loading /> : error && !product ? <ErrorBox message={error} onRetry={load} /> : product ? <>
      <View style={styles.detailImageWrap}>{product.images?.[imageIndex]?.url ? <Image source={{ uri: product.images[imageIndex].url }} style={styles.detailImage} resizeMode="contain" /> : <Text style={{ fontSize: 80 }}>🛍️</Text>}</View>
      {product.images?.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.galleryStrip}>
        {product.images.map((image, index) => <Pressable key={image.id} onPress={() => setImageIndex(index)} style={[styles.galleryThumb, index === imageIndex && styles.galleryThumbActive]}>
          <Image source={{ uri: image.url }} style={styles.galleryImage} resizeMode="cover" />
        </Pressable>)}
      </ScrollView>}
      <Text style={styles.detailCategory}>{product.category_name}</Text><Text style={styles.detailTitle}>{product.name}</Text>
      <Text style={styles.rating}>★ {Number(product.rating).toFixed(1)} <Text style={styles.muted}>({product.review_count} ratings)</Text></Text>
      <View style={styles.priceLine}><Text style={styles.detailPrice}>{money(product.price)}</Text>{product.compare_at_price ? <Text style={styles.strike}>{money(product.compare_at_price)}</Text> : null}</View>
      <Text style={styles.deliveryGreen}>FREE delivery on eligible orders</Text><Text style={styles.stock}>{product.stock > 0 ? `${product.stock} in stock` : 'Currently unavailable'}</Text>
      <Text style={styles.description}>{product.description}</Text>
      <View style={styles.quantityRow}><Text style={styles.bold}>Quantity</Text><View style={styles.quantityControl}>
        <Pressable onPress={() => setQuantity(Math.max(1, quantity - 1))}><Text style={styles.quantityButton}>−</Text></Pressable><Text style={styles.bold}>{quantity}</Text><Pressable onPress={() => setQuantity(Math.min(product.stock || 1, quantity + 1))}><Text style={styles.quantityButton}>＋</Text></Pressable>
      </View></View>
      <ErrorBox message={error} />
      <Button title={working ? 'Adding...' : 'Add to Cart'} disabled={!product.stock || working} onPress={async () => { if (await addToCart()) Alert.alert('Added to cart', 'This item is now in your cart.'); }} />
      <Button title="Buy Now" secondary disabled={!product.stock || working} onPress={async () => { if (await addToCart()) navigation.navigate('Store', { screen: 'Cart' }); }} style={{ marginTop: 10 }} />
      <Pressable onPress={saveToWishlist} style={styles.saveLink}><Text style={styles.link}>♡  Add to wishlist</Text></Pressable>
    </> : null}
  </ScrollView></Screen>;
}

export function CartScreen({ navigation }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [subtotal, setSubtotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!user) return;
    setBusy(true); setError('');
    try { const response = await api.get('/cart'); setItems(response.data.items); setSubtotal(response.data.subtotal); }
    catch (requestError) { setError(apiErrorMessage(requestError)); }
    finally { setBusy(false); }
  }, [user]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  async function update(item, quantity) {
    try {
      if (quantity === 0) await api.delete(`/cart/items/${item.product_id}`);
      else await api.patch(`/cart/items/${item.product_id}`, { quantity });
      await load();
    } catch (requestError) { setError(apiErrorMessage(requestError)); }
  }
  return <Screen navigation={navigation}><ScrollView contentContainerStyle={styles.pagePad}>
    <Text style={styles.title}>Your cart</Text>
    {!user ? <View style={styles.empty}><Text style={styles.muted}>Sign in to view your cart.</Text><Button title="Sign in" onPress={() => navigation.navigate('Login')} /></View> :
      busy ? <Loading /> : error ? <ErrorBox message={error} onRetry={load} /> : !items.length ? <View style={styles.empty}><Text style={{ fontSize: 42 }}>🛒</Text><Text style={styles.bold}>Your cart is empty</Text><Button title="Start shopping" onPress={() => navigation.navigate('Store', { screen: 'Home' })} /></View> :
        <>
          {items.map((item) => <View key={item.product_id} style={styles.cartItem}>
            <Pressable onPress={() => navigation.navigate('Product', { productId: item.product_id })}>{item.image_url ? <Image source={{ uri: item.image_url }} style={styles.cartImage} /> : <View style={[styles.cartImage, styles.imagePlaceholder]}><Text>🛍️</Text></View>}</Pressable>
            <View style={{ flex: 1 }}><Text style={styles.bold} numberOfLines={2}>{item.name}</Text><Text style={styles.productPrice}>{money(item.price)}</Text><Text style={styles.deliveryGreen}>In stock</Text>
              <View style={styles.quantityControl}><Pressable onPress={() => update(item, item.quantity - 1)}><Text style={styles.quantityButton}>{item.quantity === 1 ? '×' : '−'}</Text></Pressable><Text style={styles.bold}>{item.quantity}</Text><Pressable onPress={() => update(item, item.quantity + 1)}><Text style={styles.quantityButton}>＋</Text></Pressable></View>
            </View>
          </View>)}
          <View style={styles.summaryCard}><Text style={styles.summaryTotal}>Subtotal ({items.length} items):  {money(subtotal)}</Text><Text style={styles.mutedSmall}>Delivery charges are calculated at checkout.</Text><Button title="Proceed to checkout" onPress={() => navigation.navigate('Checkout')} style={{ marginTop: 13 }} /></View>
        </>}
  </ScrollView></Screen>;
}

export function CheckoutScreen({ navigation }) {
  const { user } = useAuth();
  const [addresses, setAddresses] = useState([]);
  const [selected, setSelected] = useState(null);
  const [cart, setCart] = useState(null);
  const [method, setMethod] = useState('cod');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!user) return;
    setBusy(true); setError('');
    try {
      const [addressResult, cartResult] = await Promise.all([api.get('/addresses'), api.get('/cart')]);
      setAddresses(addressResult.data.addresses);
      setSelected((current) => addressResult.data.addresses.some((address) => address.id === current)
        ? current
        : addressResult.data.addresses.find((address) => address.is_default)?.id || addressResult.data.addresses[0]?.id || null);
      setCart(cartResult.data);
    } catch (requestError) { setError(apiErrorMessage(requestError)); }
    finally { setBusy(false); }
  }, [user]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  async function placeOrder() {
    if (!selected) return setError('Please add or select a delivery address.');
    setBusy(true); setError('');
    let createdOrder = null;
    try {
      const response = await api.post('/orders', { address_id: selected, payment_method: method });
      createdOrder = response.data.order;
      const order = method === 'razorpay' ? await payWithRazorpay(createdOrder, user) : createdOrder;
      navigation.replace('OrderDetail', { orderId: order.id, confirmation: true });
    } catch (requestError) {
      if (createdOrder && method === 'razorpay') {
        navigation.replace('OrderDetail', { orderId: createdOrder.id, paymentError: apiErrorMessage(requestError) });
      } else setError(apiErrorMessage(requestError));
    }
    finally { setBusy(false); }
  }
  if (!user) return <Screen navigation={navigation}><View style={styles.pagePad}><Text style={styles.title}>Checkout</Text><Text style={styles.muted}>Please sign in to continue.</Text><Button title="Sign in" onPress={() => navigation.navigate('Login')} /></View></Screen>;
  const delivery = Number(cart?.subtotal || 0) >= 999 ? 0 : 49;
  return <Screen navigation={navigation}><ScrollView contentContainerStyle={styles.pagePad}>
    <Text style={styles.title}>Checkout</Text>
    {busy && !cart ? <Loading /> : <>
      <View style={styles.sectionHead}><Text style={styles.sectionTitle}>1. Delivery address</Text><Pressable onPress={() => navigation.navigate('Addresses')}><Text style={styles.link}>Manage</Text></Pressable></View>
      {addresses.map((address) => <Pressable key={address.id} style={[styles.addressCard, selected === address.id && styles.addressSelected]} onPress={() => setSelected(address.id)}>
        <Text style={styles.bold}>{selected === address.id ? '◉ ' : '○ '}{address.full_name}{address.is_default ? '  · Default' : ''}</Text>
        <Text style={styles.muted}>{address.line1}{address.line2 ? `, ${address.line2}` : ''}, {address.city}, {address.state} {address.postal_code}</Text><Text style={styles.muted}>Phone: {address.phone}</Text>
      </Pressable>)}
      {!addresses.length && <><Text style={styles.muted}>Add an address to continue.</Text><Button title="Add delivery address" secondary onPress={() => navigation.navigate('Addresses')} /></>}
      <Text style={[styles.sectionTitle, { marginTop: 22, marginBottom: 10 }]}>2. Payment method</Text>
      {[['cod', 'Cash on delivery'], ['razorpay', 'Pay online · Razorpay test mode']].map(([value, label]) =>
        <Pressable key={value} onPress={() => setMethod(value)} style={styles.paymentRow}><Text style={styles.bold}>{method === value ? '◉' : '○'}  {label}</Text></Pressable>)}
      <Text style={[styles.sectionTitle, { marginTop: 22, marginBottom: 10 }]}>3. Order summary</Text>
      <View style={styles.summaryCard}><Text style={styles.summaryLine}>Items subtotal <Text>{money(cart?.subtotal)}</Text></Text><Text style={styles.summaryLine}>Delivery <Text>{delivery ? money(delivery) : 'FREE'}</Text></Text><View style={styles.divider} /><Text style={styles.summaryTotal}>Order total  {money(Number(cart?.subtotal || 0) + delivery)}</Text></View>
      <ErrorBox message={error} onRetry={error.includes('address') ? () => navigation.navigate('Addresses') : undefined} />
      <Button title={busy ? 'Placing order...' : 'Place your order'} disabled={busy || !cart?.items?.length || !selected} onPress={placeOrder} style={{ marginTop: 12 }} />
      <Text style={[styles.mutedSmall, { textAlign: 'center', marginTop: 12 }]}>Online payments are confirmed by Razorpay before your order is marked paid.</Text>
    </>}
  </ScrollView></Screen>;
}

export function OrdersScreen({ navigation }) {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    try { const response = await api.get('/orders'); setOrders(response.data.orders); setError(''); }
    catch (requestError) { setError(apiErrorMessage(requestError)); }
    finally { setBusy(false); }
  }, [user]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  return <Screen navigation={navigation}><ScrollView contentContainerStyle={styles.pagePad}><Text style={styles.title}>Your orders</Text>
    {!user ? <Button title="Sign in" onPress={() => navigation.navigate('Login')} /> : busy ? <Loading /> : error ? <ErrorBox message={error} onRetry={load} /> :
      orders.length ? orders.map((order) => <Pressable key={order.id} style={styles.orderCard} onPress={() => navigation.navigate('OrderDetail', { orderId: order.id })}>
        <Text style={styles.bold}>Order #{order.id} <Text style={styles.status}>{order.status.replace(/_/g, ' ')}</Text></Text><Text style={styles.muted}>Placed {new Date(order.created_at).toLocaleDateString()}</Text><Text style={styles.productPrice}>{money(order.total)} · {order.payment_status}</Text>
      </Pressable>) : <View style={styles.empty}><Text style={styles.muted}>Your orders will show up here.</Text><Button title="Browse products" onPress={() => navigation.navigate('Store')} /></View>}
  </ScrollView></Screen>;
}

export function OrderDetailScreen({ navigation, route }) {
  const { user } = useAuth();
  const [order, setOrder] = useState(null);
  const [paymentWorking, setPaymentWorking] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try { const response = await api.get(`/orders/${route.params.orderId}`); setOrder(response.data.order); }
    catch (requestError) { setError(apiErrorMessage(requestError)); }
  }, [route.params.orderId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  async function retryPayment() {
    setPaymentWorking(true); setError('');
    try {
      await payWithRazorpay(order, user);
      await load();
    } catch (requestError) { setError(apiErrorMessage(requestError)); }
    finally { setPaymentWorking(false); }
  }
  return <Screen navigation={navigation}><ScrollView contentContainerStyle={styles.pagePad}>
    {route.params?.confirmation && <View style={styles.confirmBanner}><Text style={{ fontSize: 30 }}>✓</Text><View><Text style={styles.bold}>Order placed successfully</Text><Text style={styles.mutedSmall}>Thank you for shopping with ShopKart.</Text></View></View>}
    {route.params?.paymentError && order?.payment_status !== 'paid' && <ErrorBox message={route.params.paymentError} />}
    {error ? <ErrorBox message={error} onRetry={load} /> : !order ? <Loading /> : <>
      <Text style={styles.title}>Order #{order.id}</Text><View style={styles.orderCard}><Text style={styles.bold}>Status: {order.status.replace(/_/g, ' ')}</Text><Text style={styles.muted}>Payment: {order.payment_status} · {order.payment_method}</Text><Text style={styles.productPrice}>Total: {money(order.total)}</Text></View>
      {order.status === 'pending_payment' && order.payment_method === 'razorpay' && <Button title={paymentWorking ? 'Opening secure checkout...' : 'Retry online payment'} disabled={paymentWorking} onPress={retryPayment} style={{ marginTop: 10 }} />}
      <Text style={[styles.sectionTitle, { marginVertical: 12 }]}>Items</Text>{order.items?.map((item) => <View key={item.id} style={styles.orderItem}>
        {item.image_url ? <Image source={{ uri: item.image_url }} style={styles.orderImage} /> : null}<View style={{ flex: 1 }}><Text style={styles.bold}>{item.product_name}</Text><Text style={styles.muted}>{item.quantity} × {money(item.unit_price)}</Text></View><Text style={styles.bold}>{money(item.line_total)}</Text>
      </View>)}
      <Text style={[styles.sectionTitle, { marginTop: 18 }]}>Delivering to</Text><Text style={styles.muted}>{order.address_snapshot?.full_name}{'\n'}{order.address_snapshot?.line1}, {order.address_snapshot?.city}, {order.address_snapshot?.state} {order.address_snapshot?.postal_code}</Text>
      <Button title="Continue shopping" onPress={() => navigation.navigate('Store')} style={{ marginTop: 20 }} />
    </>}
  </ScrollView></Screen>;
}

export function AccountScreen({ navigation }) {
  const { user, signOut } = useAuth();
  return <Screen navigation={navigation}><ScrollView contentContainerStyle={styles.pagePad}>
    <Text style={styles.title}>Your account</Text>
    {user ? <View style={styles.accountCard}><Text style={styles.accountAvatar}>{user.name?.[0]?.toUpperCase()}</Text><View><Text style={styles.bold}>{user.name}</Text><Text style={styles.muted}>{user.email}</Text></View></View> :
      <View style={styles.accountCard}><Text style={styles.bold}>Sign in for a better experience</Text><Button title="Sign in / Register" onPress={() => navigation.navigate('Login')} /></View>}
    {[['📦', 'Your orders', 'Orders'], ['♡', 'Your wishlist', 'Wishlist'], ['⌖', 'Saved addresses', 'Addresses'], ...(user?.role === 'admin' ? [['⚙', 'Admin dashboard', 'Admin']] : [])].map(([icon, label, screen]) =>
      <Pressable key={screen} style={styles.menuRow} onPress={() => navigation.navigate(screen)}><Text style={styles.menuIcon}>{icon}</Text><Text style={styles.bold}>{label}</Text><Text style={styles.menuArrow}>›</Text></Pressable>)}
    {user && <Button title="Sign out" secondary onPress={async () => { await signOut(); Alert.alert('Signed out', 'You have signed out of ShopKart.'); }} style={{ marginTop: 22 }} />}
    <Text style={styles.version}>ShopKart · Vighnesh_Store</Text>
  </ScrollView></Screen>;
}

export function AddressesScreen({ navigation }) {
  const { user } = useAuth();
  const [addresses, setAddresses] = useState([]);
  const [form, setForm] = useState(false);
  const [fields, setFields] = useState({ full_name: '', phone: '', line1: '', line2: '', city: '', state: '', postal_code: '', country: 'India' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!user) return;
    try { const response = await api.get('/addresses'); setAddresses(response.data.addresses); setError(''); }
    catch (requestError) { setError(apiErrorMessage(requestError)); }
  }, [user]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  async function save() {
    setBusy(true); setError('');
    try { await api.post('/addresses', { ...fields, is_default: addresses.length === 0 }); setFields({ full_name: '', phone: '', line1: '', line2: '', city: '', state: '', postal_code: '', country: 'India' }); setForm(false); await load(); }
    catch (requestError) { setError(apiErrorMessage(requestError)); }
    finally { setBusy(false); }
  }
  async function remove(id) {
    try { await api.delete(`/addresses/${id}`); await load(); }
    catch (requestError) { setError(apiErrorMessage(requestError)); }
  }
  return <Screen navigation={navigation}><ScrollView contentContainerStyle={styles.pagePad}><Text style={styles.title}>Saved addresses</Text>
    {!user ? <Button title="Sign in" onPress={() => navigation.navigate('Login')} /> : <>
      <ErrorBox message={error} onRetry={load} />
      {addresses.map((item) => <View key={item.id} style={styles.addressCard}><Text style={styles.bold}>{item.full_name}{item.is_default ? ' · Default' : ''}</Text><Text style={styles.muted}>{item.line1}{item.line2 ? `, ${item.line2}` : ''}{'\n'}{item.city}, {item.state} {item.postal_code}, {item.country}</Text><Text style={styles.muted}>Phone: {item.phone}</Text><Pressable onPress={() => remove(item.id)} style={{ marginTop: 8 }}><Text style={styles.link}>Remove address</Text></Pressable></View>)}
      {form && <View style={styles.formCard}><Text style={styles.sectionTitle}>Add a new address</Text>
        {[
          ['full_name', 'Full name'], ['phone', 'Phone number'], ['line1', 'Address line 1'], ['line2', 'Address line 2 (optional)'],
          ['city', 'City'], ['state', 'State'], ['postal_code', 'Postal code'], ['country', 'Country']
        ].map(([key, label]) => <TextInput key={key} style={styles.input} placeholder={label} value={fields[key]} onChangeText={(value) => setFields((current) => ({ ...current, [key]: value }))} />)}
        <Button title={busy ? 'Saving...' : 'Save address'} disabled={busy} onPress={save} />
      </View>}
      {!form && <Button title="+ Add a new address" secondary onPress={() => setForm(true)} />}
    </>}
  </ScrollView></Screen>;
}

export function WishlistScreen({ navigation }) {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!user) return;
    try { const response = await api.get('/wishlist'); setProducts(response.data.products); setError(''); }
    catch (requestError) { setError(apiErrorMessage(requestError)); }
  }, [user]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  async function remove(id) {
    try { await api.delete(`/wishlist/${id}`); await load(); }
    catch (requestError) { setError(apiErrorMessage(requestError)); }
  }
  return <Screen navigation={navigation}><ScrollView contentContainerStyle={styles.pagePad}><Text style={styles.title}>Your wishlist</Text>
    {!user ? <Button title="Sign in" onPress={() => navigation.navigate('Login')} /> : error ? <ErrorBox message={error} onRetry={load} /> : products.length ?
      <>{products.map((item) => <View key={item.id}><ProductCard item={item} navigation={navigation} /><Pressable onPress={() => remove(item.id)}><Text style={styles.link}>Remove from wishlist</Text></Pressable></View>)}</> :
      <View style={styles.empty}><Text style={{ fontSize: 38 }}>♡</Text><Text style={styles.bold}>Your wishlist is waiting</Text><Text style={styles.muted}>Save products you love for later.</Text></View>}
  </ScrollView></Screen>;
}

export function AdminScreen({ navigation }) {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [orders, setOrders] = useState([]);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [categoryIcon, setCategoryIcon] = useState('🛍️');
  const [fields, setFields] = useState({ name: '', description: '', price: '', compare_at_price: '', stock: '', category_id: '', image_url: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (user?.role !== 'admin') return;
    setBusy(true);
    try {
      const [summaryResult, orderResult, categoryResult, productResult] = await Promise.all([
        api.get('/admin/summary'), api.get('/admin/orders'), api.get('/categories'), api.get('/products', { params: { limit: 40, sort: 'newest' } })
      ]);
      setSummary(summaryResult.data.summary); setOrders(orderResult.data.orders); setCategories(categoryResult.data.categories); setProducts(productResult.data.products); setError('');
    } catch (requestError) { setError(apiErrorMessage(requestError)); }
    finally { setBusy(false); }
  }, [user]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  async function addProduct() {
    setBusy(true); setError('');
    try {
      await api.post('/admin/products', {
        ...fields, price: Number(fields.price), compare_at_price: fields.compare_at_price ? Number(fields.compare_at_price) : null,
        stock: Number(fields.stock), category_id: fields.category_id ? Number(fields.category_id) : null
      });
      setShowForm(false); setFields({ name: '', description: '', price: '', compare_at_price: '', stock: '', category_id: '', image_url: '' }); await load();
    } catch (requestError) { setError(apiErrorMessage(requestError)); }
    finally { setBusy(false); }
  }
  async function updateStatus(order, status) {
    try { await api.patch(`/admin/orders/${order.id}`, { status }); await load(); }
    catch (requestError) { setError(apiErrorMessage(requestError)); }
  }
  async function changeStock(product, amount) {
    try { await api.patch(`/admin/products/${product.id}`, { stock: Math.max(0, Number(product.stock) + amount) }); await load(); }
    catch (requestError) { setError(apiErrorMessage(requestError)); }
  }
  async function removeProduct(product) {
    try { await api.delete(`/admin/products/${product.id}`); await load(); }
    catch (requestError) { setError(apiErrorMessage(requestError)); }
  }
  async function addCategory() {
    const name = categoryName.trim();
    if (!name) return setError('Enter a category name.');
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    try {
      await api.post('/admin/categories', { name, slug, icon: categoryIcon || '🛍️' });
      setCategoryName(''); await load();
    } catch (requestError) { setError(apiErrorMessage(requestError)); }
  }
  if (user?.role !== 'admin') return <Screen navigation={navigation}><View style={styles.pagePad}><Text style={styles.title}>Admin dashboard</Text><Text style={styles.muted}>Admin access is required for this page.</Text></View></Screen>;
  return <Screen navigation={navigation}><ScrollView contentContainerStyle={styles.pagePad}><Text style={styles.title}>Admin dashboard</Text><Text style={styles.muted}>Manage ShopKart inventory and fulfilment.</Text>
    <ErrorBox message={error} onRetry={load} />
    {summary && <View style={styles.statsGrid}>{[['Products', summary.products], ['Orders', summary.orders], ['Customers', summary.customers], ['Low stock', summary.low_stock]].map(([label, value]) => <View key={label} style={styles.statCard}><Text style={styles.statValue}>{value}</Text><Text style={styles.mutedSmall}>{label}</Text></View>)}</View>}
    <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Product inventory</Text>
    <Button title={showForm ? 'Close product form' : '+ Add product'} secondary onPress={() => setShowForm(!showForm)} />
    {showForm && <View style={styles.formCard}>
      {[
        ['name', 'Product name'], ['description', 'Description'], ['price', 'Price'], ['compare_at_price', 'Compare-at price (optional)'],
        ['stock', 'Stock quantity'], ['image_url', 'Product image URL']
      ].map(([key, label]) => <TextInput key={key} style={styles.input} placeholder={label} value={fields[key]} keyboardType={['price', 'compare_at_price', 'stock'].includes(key) ? 'decimal-pad' : 'default'} onChangeText={(value) => setFields((current) => ({ ...current, [key]: value }))} />)}
      <Text style={styles.mutedSmall}>Choose a category:</Text><ScrollView horizontal>{categories.map((item) => <Pressable key={item.id} style={[styles.sortChip, String(fields.category_id) === String(item.id) && styles.sortChipActive]} onPress={() => setFields((current) => ({ ...current, category_id: String(item.id) }))}><Text>{item.icon} {item.name}</Text></Pressable>)}</ScrollView>
      <Button title={busy ? 'Saving...' : 'Create product'} disabled={busy} onPress={addProduct} style={{ marginTop: 12 }} />
    </View>}
    <View style={styles.formCard}>
      <Text style={styles.sectionTitle}>Categories</Text>
      <View style={styles.priceRow}><TextInput style={styles.priceInput} value={categoryName} onChangeText={setCategoryName} placeholder="New category name" /><TextInput style={[styles.priceInput, { flex: 0.35 }]} value={categoryIcon} onChangeText={setCategoryIcon} placeholder="Icon" /><Button title="Add" onPress={addCategory} style={styles.applyButton} /></View>
      <Text style={styles.mutedSmall}>{categories.map((item) => `${item.icon} ${item.name}`).join('   ·   ')}</Text>
    </View>
    <Text style={[styles.sectionTitle, { marginTop: 18, marginBottom: 8 }]}>Stock levels</Text>
    {products.map((product) => <View key={product.id} style={styles.stockRow}>
      <View style={{ flex: 1 }}><Text style={styles.bold} numberOfLines={1}>{product.name}</Text><Text style={styles.mutedSmall}>Stock: {product.stock} · {money(product.price)}</Text></View>
      <Pressable onPress={() => changeStock(product, -1)} style={styles.stockButton}><Text style={styles.quantityButton}>−</Text></Pressable>
      <Pressable onPress={() => changeStock(product, 1)} style={styles.stockButton}><Text style={styles.quantityButton}>＋</Text></Pressable>
      <Pressable onPress={() => removeProduct(product)}><Text style={[styles.link, { color: '#a53327' }]}>Hide</Text></Pressable>
    </View>)}
    <Text style={[styles.sectionTitle, { marginTop: 24, marginBottom: 10 }]}>Recent orders</Text>
    {busy && !orders.length ? <Loading /> : orders.map((order) => <View key={order.id} style={styles.adminOrder}>
      <Text style={styles.bold}>#{order.id} · {order.customer_name}</Text><Text style={styles.mutedSmall}>{order.customer_email} · {money(order.total)} · {order.status}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>{['processing', 'shipped', 'delivered', 'cancelled'].map((status) => <Pressable key={status} style={styles.statusChip} onPress={() => updateStatus(order, status)}><Text style={styles.statusChipText}>{status}</Text></Pressable>)}</ScrollView>
    </View>)}
    {!busy && !orders.length && <Text style={styles.muted}>No orders yet.</Text>}
  </ScrollView></Screen>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { backgroundColor: C.navy, paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 48 : 30, paddingBottom: 11 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 33 },
  brand: { color: C.white, fontSize: 23, fontWeight: '800', letterSpacing: -0.7 },
  brandDot: { color: C.orange },
  cartHead: { paddingHorizontal: 5 },
  delivery: { paddingVertical: 5 },
  searchBar: { height: 42, backgroundColor: C.white, borderRadius: 7, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 9 },
  searchHint: { flex: 1, color: '#7a8492', fontSize: 14 },
  categoryStrip: { flexGrow: 0, backgroundColor: C.white, paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: 1, borderColor: C.line },
  categoryChip: { alignItems: 'center', width: 80, paddingHorizontal: 5 },
  categoryIcon: { fontSize: 25, marginBottom: 3 },
  categoryLabel: { color: C.ink, textAlign: 'center', fontSize: 10, fontWeight: '600' },
  hero: { backgroundColor: C.navy, margin: 13, padding: 18, borderRadius: 12, minHeight: 178, overflow: 'hidden' },
  heroEyebrow: { color: '#f5bd7f', fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  heroTitle: { color: C.white, fontSize: 28, fontWeight: '800', lineHeight: 31, marginTop: 8 },
  heroCopy: { color: '#d5dce5', fontSize: 12, marginTop: 7, maxWidth: '70%' },
  heroCta: { color: '#ffc582', fontWeight: '700', marginTop: 12 },
  heroBag: { position: 'absolute', right: 12, top: 47, fontSize: 70, opacity: 0.9 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingTop: 8, paddingBottom: 10 },
  sectionTitle: { color: C.ink, fontSize: 17, fontWeight: '700' },
  title: { fontSize: 25, color: C.ink, fontWeight: '800', marginBottom: 6 },
  bold: { fontSize: 14, color: C.ink, fontWeight: '700' },
  muted: { color: C.gray, fontSize: 13, lineHeight: 20 },
  mutedSmall: { color: C.gray, fontSize: 11, lineHeight: 16 },
  link: { color: '#136aa3', fontSize: 13, fontWeight: '700' },
  productGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 11, paddingBottom: 12 },
  productCard: { width: '48.5%', backgroundColor: C.white, padding: 9, marginBottom: 9, borderRadius: 9, borderWidth: 1, borderColor: '#edf0f2', overflow: 'hidden' },
  productImage: { height: 145, width: '100%', borderRadius: 6, backgroundColor: '#f4f5f6' },
  imagePlaceholder: { justifyContent: 'center', alignItems: 'center' },
  discountPill: { backgroundColor: '#d94b3e', color: C.white, alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4, fontSize: 10, marginTop: 7 },
  productName: { color: C.ink, fontSize: 13, fontWeight: '600', lineHeight: 18, marginTop: 7, minHeight: 36 },
  rating: { color: '#d38211', fontSize: 12, marginTop: 4 },
  productPrice: { color: C.ink, fontWeight: '800', fontSize: 16, marginTop: 4 },
  promoSmall: { margin: 13, borderRadius: 9, backgroundColor: C.white, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  pagePad: { padding: 16, paddingBottom: 32 },
  categoryRow: { backgroundColor: C.white, borderRadius: 9, padding: 14, flexDirection: 'row', alignItems: 'center', marginTop: 9, gap: 12 },
  categoryRowIcon: { fontSize: 26, width: 38, textAlign: 'center' },
  errorBox: { backgroundColor: '#fff0ed', padding: 12, borderRadius: 8, marginVertical: 8, borderWidth: 1, borderColor: '#ffd2ca' },
  errorText: { color: '#a53327', fontSize: 13, lineHeight: 19 },
  loading: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyText: { color: C.gray, textAlign: 'center', padding: 24 },
  searchControls: { backgroundColor: C.white, paddingHorizontal: 13, paddingTop: 13, paddingBottom: 8, borderBottomWidth: 1, borderColor: C.line },
  searchInputRow: { flexDirection: 'row', alignItems: 'center', borderColor: C.line, borderWidth: 1, borderRadius: 7, paddingHorizontal: 11, marginBottom: 10 },
  searchInput: { flex: 1, paddingVertical: 10, color: C.ink },
  sortChip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 18, backgroundColor: '#f1f3f5', marginRight: 7, marginTop: 7 },
  sortChipActive: { backgroundColor: C.navy },
  sortText: { color: C.ink, fontSize: 11 },
  sortTextActive: { color: C.white, fontWeight: '700' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  priceInput: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 6, padding: 7, fontSize: 12 },
  applyButton: { paddingVertical: 9, paddingHorizontal: 15 },
  searchResults: { paddingTop: 10, paddingBottom: 30 },
  empty: { alignItems: 'center', padding: 25, gap: 9 },
  pagination: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', padding: 12 },
  button: { backgroundColor: C.orange, paddingHorizontal: 18, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', borderRadius: 7, minHeight: 45 },
  buttonText: { color: C.navy, fontWeight: '800', fontSize: 14 },
  buttonSecondary: { backgroundColor: C.white, borderWidth: 1, borderColor: '#aeb6c1' },
  buttonSecondaryText: { color: C.ink },
  detailPage: { padding: 15, paddingBottom: 32 },
  detailImageWrap: { height: 300, borderRadius: 10, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  detailImage: { width: '100%', height: '100%' },
  galleryStrip: { flexGrow: 0, marginTop: 8 },
  galleryThumb: { width: 60, height: 60, padding: 3, backgroundColor: C.white, borderRadius: 6, borderWidth: 1, borderColor: C.line, marginRight: 7 },
  galleryThumbActive: { borderColor: C.orange, borderWidth: 2 },
  galleryImage: { width: '100%', height: '100%', borderRadius: 4 },
  detailCategory: { color: C.gray, fontSize: 12, marginTop: 16 },
  detailTitle: { color: C.ink, fontSize: 22, fontWeight: '700', marginTop: 5 },
  priceLine: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  detailPrice: { fontSize: 25, color: C.ink, fontWeight: '800' },
  strike: { textDecorationLine: 'line-through', color: C.gray, fontSize: 15 },
  deliveryGreen: { color: C.green, fontWeight: '600', fontSize: 12, marginTop: 7 },
  stock: { color: C.green, fontWeight: '700', marginTop: 7 },
  description: { color: C.ink, lineHeight: 22, marginTop: 14 },
  quantityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 19 },
  quantityControl: { flexDirection: 'row', alignItems: 'center', gap: 18, borderWidth: 1, borderColor: C.line, backgroundColor: C.white, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  quantityButton: { color: '#126d9b', fontSize: 22, paddingHorizontal: 4 },
  saveLink: { alignItems: 'center', padding: 14 },
  cartItem: { backgroundColor: C.white, borderRadius: 9, padding: 11, marginTop: 10, flexDirection: 'row', gap: 12 },
  cartImage: { width: 95, height: 105, borderRadius: 7, backgroundColor: '#f2f4f6' },
  summaryCard: { backgroundColor: C.white, borderRadius: 9, padding: 15, marginTop: 16 },
  summaryTotal: { color: C.ink, fontSize: 17, fontWeight: '800' },
  summaryLine: { flexDirection: 'row', justifyContent: 'space-between', color: C.ink, paddingVertical: 6 },
  divider: { height: 1, backgroundColor: C.line, marginVertical: 9 },
  addressCard: { backgroundColor: C.white, borderRadius: 9, padding: 13, marginTop: 10, borderWidth: 1, borderColor: C.line },
  addressSelected: { borderColor: C.orange, borderWidth: 2 },
  paymentRow: { backgroundColor: C.white, padding: 14, borderRadius: 8, marginTop: 7, borderWidth: 1, borderColor: C.line },
  orderCard: { backgroundColor: C.white, padding: 14, marginTop: 10, borderRadius: 9 },
  status: { color: C.green, textTransform: 'capitalize', fontWeight: '700' },
  orderItem: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.white, padding: 10, borderRadius: 8, marginTop: 7 },
  orderImage: { width: 55, height: 55, borderRadius: 5 },
  confirmBanner: { flexDirection: 'row', gap: 13, backgroundColor: '#e7f6ed', padding: 14, borderRadius: 9, alignItems: 'center' },
  accountCard: { flexDirection: 'row', gap: 13, alignItems: 'center', backgroundColor: C.white, borderRadius: 10, padding: 14, marginVertical: 14 },
  accountAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.pale, textAlign: 'center', textAlignVertical: 'center', color: C.navy, fontSize: 21, fontWeight: '800', overflow: 'hidden' },
  menuRow: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: C.white, padding: 15, borderBottomWidth: 1, borderColor: C.bg },
  menuIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  menuArrow: { marginLeft: 'auto', color: C.gray, fontSize: 23 },
  version: { textAlign: 'center', color: C.gray, fontSize: 11, marginTop: 24 },
  formCard: { backgroundColor: C.white, borderRadius: 9, padding: 13, marginVertical: 12 },
  input: { backgroundColor: C.white, borderWidth: 1, borderColor: '#cbd1d8', borderRadius: 7, paddingHorizontal: 12, paddingVertical: 12, marginTop: 10, color: C.ink, fontSize: 14 },
  authTop: { backgroundColor: C.navy, paddingHorizontal: 18, paddingTop: Platform.OS === 'ios' ? 48 : 29, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 16 },
  back: { fontSize: 33, color: C.white, lineHeight: 35 },
  authContent: { padding: 20, paddingTop: 27, alignItems: 'stretch' },
  splash: { flex: 1, backgroundColor: C.navy, padding: 24, justifyContent: 'space-between' },
  splashTop: { marginTop: Platform.OS === 'ios' ? 56 : 35 },
  brandLarge: { color: C.white, fontSize: 35, fontWeight: '900', letterSpacing: -1 },
  splashTag: { color: '#e0e6ef', fontSize: 15, marginTop: 5 },
  splashIllustration: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  splashCaption: { color: C.white, fontSize: 20, fontWeight: '700', marginTop: 16 },
  splashActions: { gap: 11, paddingBottom: 14 },
  splashFoot: { textAlign: 'center', color: '#bdc8d6', fontSize: 12, paddingTop: 6 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginVertical: 13 },
  statCard: { backgroundColor: C.white, width: '48%', padding: 14, borderRadius: 9, marginBottom: 9 },
  statValue: { color: C.navy, fontSize: 23, fontWeight: '800' },
  stockRow: { backgroundColor: C.white, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, marginTop: 6, borderRadius: 8 },
  stockButton: { backgroundColor: '#f2f4f6', borderRadius: 6 },
  adminOrder: { backgroundColor: C.white, borderRadius: 8, padding: 12, marginTop: 9 },
  statusChip: { backgroundColor: '#edf0f3', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, marginTop: 9, marginRight: 6 },
  statusChipText: { color: C.navy, fontSize: 11, fontWeight: '700', textTransform: 'capitalize' }
});
