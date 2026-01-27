# Implement Shop Logout

Add a logout button to the shop list page (`/shop`) to allow users to sign out.

## Proposed Changes

### Frontend
#### [MODIFY] [page.tsx](file:///c:/git/meishigawarini/frontend/app/shop/page.tsx)
- Import `signOut` from `aws-amplify/auth`.
- Add a `handleLogout` function that calls `signOut()` and redirects to `/`.
- Add a "Logout" button to the header section (next to "Create New Shop").

```tsx
// ... imports
import { getCurrentUser, signOut } from 'aws-amplify/auth';
// ...

export default function ShopListPage() {
    // ...
    const handleLogout = async () => {
       try {
           await signOut();
           router.push('/');
       } catch (error) {
           console.error('Error signing out: ', error);
       }
    };

    // ...
    return (
        // ...
        <div className="flex justify-between items-center">
            <div>
                <h1 className="text-3xl font-bold text-gray-900">My Shops</h1>
                <p className="text-gray-500">Select a shop to manage or create a new one.</p>
            </div>
            <div className="flex gap-4"> {/* Container for buttons */}
                <Button variant="outline" onClick={handleLogout}>Logout</Button>
                <Dialog>
                   {/* Create Shop Dialog ... */}
                </Dialog>
            </div>
        </div>
        // ...
    )
}
```

## Verification
1.  Apply changes.
2.  Run `npm run dev`.
3.  Login and visit `/shop`.
4.  Click "Logout".
5.  Verify redirection to title page and session clear (cannot access `/shop` again without login).
