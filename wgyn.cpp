#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <math.h>
#include <string>
#include <deque>



/* 
 * We make RPN expressions where __ is a digit and x is an binary operation.
 *
 * There must be 4 __ obviously.
 * Each x combines two __'s so we need 3 x's to
 * combine everything into one result.
 *
 * There are 5 valid ways to put 3 operations between 4 digits:
 * 1: __   __ x __ x __ x  
 * 2: __   __ x __   __ xx 
 * 3: __   __   __ xx__ x  
 * 4: __   __   __ x __ xx 
 * 5: __   __   __ x __ x  
 *
 * If we assign integer values to each operation 
 * we can store this as an array of 7 integers.
 *
 * In addition the factorial unary operation can be placed after any __ and x
 * __!    __! x! __! x! __! x! 
 *
 *  We store factorials as an array of 7 integers where
 *  a zero in position i represents no factorial after the i-th digit or operation
 *  a one in position i represents a factorial after the i-th digit or operation.
 *
 */



// Assign numbers to all the possible binary operations (no factorial)
// We number them starting from 10 to not overlap with the digits 0-9
enum operation {
    ADD = 10,  // this is very important
    SUB, 
    MUL, 
    DIV, 
    POW, 
    LOG, 
    APP, // append
    NUL  // null operation, has no use
};

// A structure representing a solution
// sequence: a set of 7 numbers representing digits or binary operations
// fact_array: whether or not there is a factorial
typedef struct {
    int sequence[7];
    int fact_array[7];
} solution;

// just some functions
void permute_operations(int d1, int d2, int d3, int d4);
void permute_sequence(int d1, int d2, int d3, int d4, operation o1, operation o2, operation o3);
void evaluate(int sequence[], int fact_array[]);

// Global variables for the 4 digits and the solutions found
int      numbers[4];
solution results[101];
int      solved [101];



static inline int is_integral(double x)
{
    return floor(fabs(x)) == fabs(x);
}

static inline int factorial(int n)
{
    int i;
    int x = 1;

    if(n == 0) return 1;
    for(i = 1; i <= n; i++)
        x *= i;
    return x;
}



void print_seq(int sequence[], int fact_array[])
{
    int i;

    for(i = 0; i < 7; i++) {
        switch(sequence[i]) {
        case ADD:
            fprintf(stdout, " +"); break;
        case SUB:
            fprintf(stdout, " -"); break;
        case MUL:
            fprintf(stdout, " *"); break;
        case DIV:
            fprintf(stdout, " /"); break;
        case POW:
            fprintf(stdout, " ^"); break;
        case LOG:
            fprintf(stdout, " log"); break;
        case APP:
            fprintf(stdout, " join"); break;
        case NUL:
            break;
        default:
            fprintf(stdout, " %d", sequence[i]);
        }

        if(fact_array[i])
            fprintf(stdout, " !");
    }
    fprintf(stdout, "\n");
}

std::string print_formatted(int sequence[], int fact_array[])
{
    int i;
    // Order of operations indicator used to place parentheses
    // 1=+ or -, 2=* or / or !, 3=^ or log, 4=just a number
    std::deque<int> expr_type; 
    std::deque<std::string> stack;
    std::string str, a, b;

    for(i=0; i<7; i++) {
        switch(sequence[i]) {
        case ADD:
            str = stack[1] + " + " + stack[0];
            stack.pop_front(); stack.pop_front();
            stack.push_front(str);
            expr_type.pop_front(); expr_type.pop_front();
            expr_type.push_front(1);
            break;
        case SUB:
            str = stack[1] + " - " + stack[0];
            stack.pop_front(); stack.pop_front();
            stack.push_front(str);
            expr_type.pop_front(); expr_type.pop_front();
            expr_type.push_front(1);
            break;
        case MUL:
            a = expr_type[1] < 2? "(" + stack[1] + ")" : stack[1];
            b = expr_type[0] < 2? "(" + stack[0] + ")" : stack[0];
            str = a + " x " + b;
            stack.pop_front(); stack.pop_front();
            stack.push_front(str);
            expr_type.pop_front(); expr_type.pop_front();
            expr_type.push_front(2);
            break;
        case DIV:
            a = expr_type[1] < 2? "(" + stack[1] + ")" : stack[1];
            b = expr_type[0] < 2? "(" + stack[0] + ")" : stack[0];
            str = a + " / " + b;
            stack.pop_front(); stack.pop_front();
            stack.push_front(str);
            expr_type.pop_front(); expr_type.pop_front();
            expr_type.push_front(2);
            break;
        case POW:
            a = expr_type[1] < 4? "(" + stack[1] + ")" : stack[1];
            b = expr_type[0] < 4? "(" + stack[0] + ")" : stack[0];
            str = a + "^" + b;
            stack.pop_front(); stack.pop_front();
            stack.push_front(str);
            expr_type.pop_front(); expr_type.pop_front();
            expr_type.push_front(3);
            break;
        case LOG:
            a = stack[1];
            b = expr_type[0] < 4? "(" + stack[0] + ")" : stack[0];
            str = "log_" + b + "(" + a + ")";
            stack.pop_front(); stack.pop_front();
            stack.push_front(str);
            expr_type.pop_front(); expr_type.pop_front();
            expr_type.push_front(3);
            break;
        case APP:
            str = stack[1] + stack[0];
            stack.pop_front(); stack.pop_front();
            stack.push_front(str);
            expr_type.pop_front(); expr_type.pop_front();
            expr_type.push_front(4);
            break;
        case NUL:
            break;
        default:
            stack.push_front(std::to_string(sequence[i]));
            expr_type.push_front(4);
        }

        // handle factorials
        if(fact_array[i]) {
            str = expr_type[0] < 4? "(" + stack[0] + ")" : stack[0];
            stack.pop_front();
            stack.push_front(str + "!");
            expr_type.pop_front();
            expr_type.push_front(2);
        }
    }

    return stack.front();
}



void permute_digits_and_evaluate()
{
    int a, b, c, d;

    // First we permute the 4 digits
    for(a=0; a<4; a++)
    for(b=0; b<4; b++)
    for(c=0; c<4; c++)
    for(d=0; d<4; d++) {
        if((a == 0 || b == 0 || c == 0 || d == 0) && // check if it's a
           (a == 1 || b == 1 || c == 1 || d == 1) && // valid permutation
           (a == 2 || b == 2 || c == 2 || d == 2) &&
           (a == 3 || b == 3 || c == 3 || d == 3))
        {
            permute_operations(numbers[a], numbers[b], numbers[c], numbers[d]);
        }
    }
}

void permute_operations(int d1, int d2, int d3, int d4)
{
    operation o1, o2, o3;

    for(o1 = ADD; o1 < NUL; o1=static_cast<operation>(o1+1)) 
    for(o2 = ADD; o2 < NUL; o2=static_cast<operation>(o2+1)) 
    for(o3 = ADD; o3 < NUL; o3=static_cast<operation>(o3+1)) {
        permute_sequence(d1, d2, d3, d4, o1, o2, o3);
    }
}

void permute_sequence(int d1, int d2, int d3, int d4, operation o1, operation o2, operation o3)
{
    int i;
    int fact_num;
    int fact_array[7];
    int sequence1[] = {d1, d2, o1, d3, o2, d4, o3};
    int sequence2[] = {d1, d2, o1, d3, d4, o2, o3};
    int sequence3[] = {d1, d2, d3, o1, o2, d4, o3};
    int sequence4[] = {d1, d2, d3, o1, d4, o2, o3};
    int sequence5[] = {d1, d2, d3, d4, o1, o2, o3};

    // this is how we check over all factorials
    // if we read the 7 number fact_array as a 7 digit binary number
    // we can loop from zero to 2^7 to cover all fact_arrays
    for(fact_num = 0; fact_num < (1<<7); fact_num++) {
        for(i = 0; i < 7; i++) {
            fact_array[i] = (fact_num >> i) & 1;
        }
        
        evaluate(sequence1, fact_array);
        evaluate(sequence2, fact_array);
        evaluate(sequence3, fact_array);
        evaluate(sequence4, fact_array);
        evaluate(sequence5, fact_array);
    }
}

void drop(double *stack, int *stack_info, int *depth)
{
    memmove(stack, stack+1, 4*sizeof(double));
    memmove(stack_info, stack_info+1, 4*sizeof(int));
    (*depth)--;
}

void evaluate(int sequence[], int fact_array[])
{
    int i;
    int n;
    double stack[5];
    int stack_info[5]; // for concatenation, 0 = not used yet, 1 = used already
    int depth = 0;
    
    // Evaluate the input
    // The terms of the sequence are placed into the stack one at a time
    // and operations are evaluated.
    for(i = 0; i < 7; i++) {
        switch(sequence[i]) {
        case ADD:
            stack[1] = stack[1] + stack[0];
            stack_info[1] = 1;
            drop(stack, stack_info, &depth);
            break;
        case SUB:
            stack[1] = stack[1] - stack[0];
            stack_info[1] = 1;
            drop(stack, stack_info, &depth);
            break;
        case MUL:
            stack[1] = stack[1] * stack[0];
            stack_info[1] = 1;
            drop(stack, stack_info, &depth);
            break;
        case DIV:
            stack[1] = stack[1] / stack[0];
            stack_info[1] = 1;
            drop(stack, stack_info, &depth);
            break;
        case POW:
            stack[1] = pow(stack[1], stack[0]);
            stack_info[1] = 1;
            drop(stack, stack_info, &depth);
            break;
        case LOG:
            stack[1] = log(stack[1]) / log(stack[0]);
            stack_info[1] = 1;
            drop(stack, stack_info, &depth);
            break;
        case APP:
            if(stack_info[0] != 0 || stack_info[1] != 0) return; // you can only append "new" numbers
            if(stack[1] == 0) return; // no leading zero
            if(stack[0] > 9) return;  // no appending multi-digit numbers
            stack[1] = (stack[0] <= 1? 10 : pow(10, 1 + floor(log10(stack[0])))) * stack[1] + stack[0];
            drop(stack, stack_info, &depth);
            break;
        case NUL:
            break;
        default: // add new number
            memmove(stack+1, stack, 4*sizeof(double));
            stack[0] = sequence[i];
            memmove(stack_info+1, stack_info, 4*sizeof(int));
            stack_info[0] = 0;
            depth++;
            break;
        }

        // error check
        if(isinf(stack[0])) return;
        if(isnan(stack[0])) return;

        // Handle factorials
        if(fact_array[i]) {
            if(!is_integral(stack[0]))
                return; // can't factorial non-integral             
            if((stack[0] < 3 && stack[n] != 0) || stack[0] > 20)
                return; // factorial bounds
            stack[0] = factorial(stack[0]);
            stack_info[0] = 1;
        }
        
     }

    // Check the result
    if(is_integral(stack[0]) && stack[0] > 0 && stack[0] < 101) {
        n = stack[0];
        if(solved[n]) return;
        solved[n] = 1;
        for(i = 0; i < 7; i++) {
            results[n].sequence[i]   = sequence[i];
            results[n].fact_array[i] = fact_array[i];
        }
    }
}



void run_program(int n1, int n2, int n3, int n4)
{
    int i;

    numbers[0] = n1;
    numbers[1] = n2;
    numbers[2] = n3;
    numbers[3] = n4;

    // digits must be 0-9
    for(i = 0; i < 4; i++)
        if(numbers[i] < 0 || numbers[i] > 9) 
            return;

    // nothing's solved yet
    for(i = 0; i < 101; i++)
        solved[i] = 0;

    permute_digits_and_evaluate();
}

// Return all results in one string
const char *output_results()
{
    int i;
    int n_solutions = 0;

    char buf[100];
    std::string output;

    for(i = 1; i <= 100; i++) {
        sprintf(buf, "%3d: ", i);
        output += std::string(buf);
        if(!solved[i]) 
            output += "No solution found\n";
        else {
            output += print_formatted(results[i].sequence, results[i].fact_array);
            output += "\n";
            n_solutions++;
        }
    }

    sprintf(buf, "Solved %d/100\n", n_solutions);
    output += std::string(buf);

    return output.c_str();
}

// The final function exposed to the javascript interface
extern "C" {
const char *solve_wgyn(int n1, int n2, int n3, int n4)
{
    run_program(n1, n2, n3, n4);
    return output_results();
}
}



int main(int argc, char **argv)
{
    int n1, n2, n3, n4;

    if(argc >= 5) {
        sscanf(argv[1], "%d", &n1);
        sscanf(argv[2], "%d", &n2);
        sscanf(argv[3], "%d", &n3);
        sscanf(argv[4], "%d", &n4);
    }
    else scanf("%d %d %d %d", &n1, &n2, &n3, &n4);

    printf("%s", solve_wgyn(n1, n2, n3, n4));
    
    return 0;
}

