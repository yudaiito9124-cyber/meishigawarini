
const token = "eyJraWQiOiJ3SEVxR09Ja1wvQU1ISk4zNDJTMUVIQmcrcDcwT2ZMdlB6dktteHgyVHdEST0iLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiI0NzQ0ZWEyOC02MDIxLTcwM2EtMjI0Ni00NDlhZGZlNTFhYWEiLCJjb2duaXRvOmdyb3VwcyI6WyJBZG1pbmlzdHJhdG9ycyJdLCJpc3MiOiJodHRwczpcL1wvY29nbml0by1pZHAuYXAtbm9ydGhlYXN0LTEuYW1hem9uYXdzLmNvbVwvYXAtbm9ydGhlYXN0LTFfa2RWYUx4NlJuIiwiY2xpZW50X2lkIjoiMmR1c3Fva3FtYzhsZmExcnBmZnYxZ2J1dnYiLCJvcmlnaW5fanRpIjoiZjg0NjAyZDEtNzMwOC00ZTJjLThkNTktMzViNzc3Nzk2MTQwIiwiZXZlbnRfaWQiOiIzNjZiNmQ5Yy0yYjcxLTRmMzItYjVlZi1jZGMwZDUyYjEzNzciLCJ0b2tlbl91c2UiOiJhY2Nlc3MiLCJzY29wZSI6ImF3cy5jb2duaXRvLnNpZ25pbi51c2VyLmFkbWluIiwiYXV0aF90aW1lIjoxNzY5Njc4NzIyLCJleHAiOjE3Njk2ODIzMjIsImlhdCI6MTc2OTY3ODcyMiwianRpIjoiNDg0MWE2Y2YtZGMwOS00MzE4LTk4MDUtMTRjMjM1ZmUyZmViIiwidXNlcm5hbWUiOiI0NzQ0ZWEyOC02MDIxLTcwM2EtMjI0Ni00NDlhZGZlNTFhYWEifQ.n2R_m4XareNDAb9CXMD6hwpKldOtxExWPxidYElE-AHOpk73clCVPFKQ8q56ciVUEny4z4_R6-cFPAfUo7zYUnO-f4ZRfDi37m9Fnyd68wB6P31FkSDhtrBjLY2nxgl0G34r99oclzwucJxS9qCKB0zGw-7hhq6JEHcz5-_KPYiZtcZseYTo0TDyGGQZWSFvheKzvIrusNmrmazr2GXTqv-jqXGKlpBfAWr21R_vjZWCPWafqYtD4p9B6TNcXpYp3z3yQE0e-7PBlipW_tRpPw6yur50kwAozOuoauLEfIFubp3r4vQ5NW6Nu5XeIZs9vJMPescrY9VGXunskp8KkA";

async function run() {
    try {
        const res = await fetch('https://r51shk8xzc.execute-api.ap-northeast-1.amazonaws.com/prod/admin/auth/verify', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        console.log('Status:', res.status);
        console.log('Headers:', JSON.stringify([...res.headers.entries()], null, 2));
        const text = await res.text();
        console.log('Body:', text);
    } catch (e) {
        console.error(e);
    }
}
run();
